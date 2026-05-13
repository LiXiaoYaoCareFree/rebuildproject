import path from "node:path";
import type { Provider } from "../providers/index.js";
import type { Chapter, Plan } from "./planner.js";
import type { Stack } from "./stack-detector.js";
import type { Layered } from "./layerer.js";
import type { Language } from "../config/store.js";
import {
  renderSystem,
  renderOverview,
  renderChapter,
} from "../prompts/index.js";

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "ts", ".tsx": "tsx", ".js": "js", ".jsx": "jsx",
  ".mjs": "js", ".cjs": "js",
  ".py": "python", ".go": "go", ".rs": "rust",
  ".json": "json", ".yaml": "yaml", ".yml": "yaml",
  ".toml": "toml", ".md": "markdown",
  ".sh": "bash", ".dockerfile": "dockerfile",
};

function langForFile(rel: string, ext: string): string {
  if (path.posix.basename(rel) === "Dockerfile") return "dockerfile";
  if (rel.endsWith(".gitignore")) return "gitignore";
  return EXT_TO_LANG[ext] ?? "text";
}

export interface BuildOverviewInput {
  provider: Provider;
  language: Language;
  stack: Stack;
  layered: Layered;
  plan: Plan;
}

export async function buildOverview(input: BuildOverviewInput): Promise<string> {
  const fileTree = renderFileTree(input.layered);
  const chaptersMap = input.plan.chapters
    .map((c) => `- ${c.id} · ${c.title}`)
    .join("\n");

  const userPrompt = renderOverview({
    stack: input.stack,
    fileTree,
    chaptersMap,
  });

  const res = await input.provider.complete({
    messages: [
      { role: "system", content: renderSystem(input.language) },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 6000,
    temperature: 0.3,
  });
  return res.text.trim();
}

export interface BuildChapterInput {
  provider: Provider;
  language: Language;
  stack: Stack;
  chapter: Chapter;
}

export async function buildChapter(input: BuildChapterInput): Promise<string> {
  const filesContent = await Promise.all(
    input.chapter.files.map(async (lf) => ({
      path: lf.file.relPath,
      lang: langForFile(lf.file.relPath, lf.file.ext),
      content: truncate(await lf.file.read(), 60_000),
    }))
  );

  const userPrompt = renderChapter({
    stack: input.stack,
    chapter: input.chapter,
    filesContent,
  });

  const res = await input.provider.complete({
    messages: [
      { role: "system", content: renderSystem(input.language) },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 8000,
    temperature: 0.3,
  });
  return res.text.trim();
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "\n/* ...truncated... */";
}

function renderFileTree(layered: Layered): string {
  const lines: string[] = [];
  for (const layer of ["L1", "L2", "L3", "L4", "L5", "L6"] as const) {
    const list = layered.byLayer[layer];
    if (!list.length) continue;
    lines.push(`### ${layer}`);
    for (const lf of list.slice(0, 60)) {
      lines.push(`- ${lf.file.relPath}${lf.module ? ` _(模块: ${lf.module})_` : ""}`);
    }
    if (list.length > 60) lines.push(`- ... 共 ${list.length} 个文件`);
  }
  return lines.join("\n");
}
