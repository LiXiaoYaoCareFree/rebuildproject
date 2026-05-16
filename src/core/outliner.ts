import path from "node:path";
import type { Provider } from "../providers/index.js";
import type { Stack } from "./stack-detector.js";
import type { Layered, LayeredFile } from "./layerer.js";
import type { Chapter, ChapterKind } from "./planner.js";
import { logger } from "../utils/logger.js";

/**
 * The outliner asks the LLM to *design the table of contents* for the rebuild
 * book by looking at the project itself. The deterministic `planChapters` is
 * still kept as a fallback (offline-safe), but when an outline call succeeds
 * the book's structure mirrors the real cognitive shape of the project —
 * including chapters that pure pattern-matching could never invent (e.g.
 * "the prompt pipeline" as a chapter that spans files in different folders).
 *
 * Output contract (strict JSON; we tolerate prose preamble and code fences):
 *
 *   {
 *     "chapters": [
 *       {
 *         "id": "01-01",
 *         "slug": "package-and-bin",
 *         "title": "...",
 *         "kind": "scaffold" | "dependencies" | "core"
 *               | "module-overview" | "module" | "tests" | "deployment",
 *         "section": "脚手架",
 *         "subdir": "01-scaffold",
 *         "module": "commands"          // optional
 *         "files": ["package.json", "bin/cli.js"],
 *         "deps": ["00 · 整体浏览与总任务"],
 *         "focus": "本章只攻克 package.json 与 bin/cli.js …"
 *       }
 *     ]
 *   }
 */

const ALLOWED_KINDS: readonly ChapterKind[] = [
  "scaffold",
  "dependencies",
  "core",
  "module-overview",
  "module",
  "tests",
  "deployment",
];

export interface BuildOutlineInput {
  provider: Provider;
  stack: Stack;
  layered: Layered;
}

export interface OutlineProposal {
  id: string;
  slug: string;
  title: string;
  kind: ChapterKind;
  section?: string;
  subdir?: string;
  module?: string;
  files: string[];
  deps?: string[];
  focus?: string;
}

interface RawProposal {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  kind?: unknown;
  section?: unknown;
  subdir?: unknown;
  module?: unknown;
  files?: unknown;
  deps?: unknown;
  focus?: unknown;
}

/**
 * Ask the LLM to design the chapter outline. Returns `null` on any failure
 * (network error, unparseable JSON, validation rejection) so the caller can
 * fall back to the deterministic planner.
 */
export async function buildOutline(
  input: BuildOutlineInput
): Promise<Chapter[] | null> {
  const { provider, stack, layered } = input;

  const fileIndex = new Map<string, LayeredFile>();
  for (const layer of ["L1", "L2", "L3", "L4", "L5", "L6"] as const) {
    for (const lf of layered.byLayer[layer]) fileIndex.set(lf.file.relPath, lf);
  }
  const allPaths = [...fileIndex.keys()];
  const sourcePaths = [...fileIndex.values()]
    .filter((lf) => lf.layer === "L4")
    .map((lf) => lf.file.relPath);

  const fileTree = renderTreeForPrompt(layered);

  const userPrompt = buildPrompt({
    stack,
    fileTree,
    fileCount: allPaths.length,
    sourceCount: sourcePaths.length,
  });

  let raw: string;
  try {
    const res = await provider.complete({
      messages: [
        {
          role: "system",
          content:
            "你是一名资深技术作者，正在为项目搭建实战课设计目录。只输出 JSON，不要任何前言或代码围栏。",
        },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 12000,
      temperature: 0.2,
    });
    raw = res.text.trim();
  } catch (err) {
    logger.dim(
      `  目录设计 LLM 调用失败，回退到内置 planner：${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }

  const parsed = parseOutlineJson(raw);
  if (!parsed) {
    logger.dim(
      "  目录设计输出无法解析为 JSON，回退到内置 planner（用 --debug 查看原文）"
    );
    return null;
  }

  const chapters = mapProposalsToChapters(parsed, fileIndex);
  if (!chapters) return null;

  // Coverage: every L4 source file should be referenced by at least one chapter.
  const covered = new Set<string>();
  for (const c of chapters) for (const lf of c.files) covered.add(lf.file.relPath);
  const missing = sourcePaths.filter((p) => !covered.has(p));
  if (missing.length > 0) {
    logger.dim(
      `  目录覆盖检查：${missing.length} 个源文件未被任何章节引用，自动补齐兜底章节`
    );
    chapters.push(...synthesizeOverflowChapters(missing, fileIndex));
  }

  // Always prepend the overview chapter (the LLM is not asked to invent it).
  chapters.unshift({
    id: "00",
    slug: "00-intent",
    title: "整体浏览与总任务：你接下来要重建什么",
    kind: "overview",
    files: [],
    deps: [],
    section: "总览",
  });

  // Minimum chapter floor — user asked for "10+"; if we're below, fall back so
  // the deterministic planner can produce its fine-grained split instead.
  if (chapters.length < 10) {
    logger.dim(
      `  LLM 设计的章节数 ${chapters.length} < 10，回退到内置 planner 以保证粒度`
    );
    return null;
  }

  return chapters;
}

/* ─────────────────────────── Prompt assembly ─────────────────────────── */

function buildPrompt(args: {
  stack: Stack;
  fileTree: string;
  fileCount: number;
  sourceCount: number;
}): string {
  return [
    `任务：为下面这个项目设计《项目搭建实战课》的**目录**——一份从空目录到完整可跑副本的逐章学习路线。`,
    ``,
    `## 项目栈`,
    `- 语言/运行时：${args.stack.language} / ${args.stack.runtime}`,
    `- 包管理 / 构建：${args.stack.packageManager} / ${args.stack.buildTool}`,
    `- 框架：${args.stack.frameworks.join(", ") || "无"}`,
    `- 入口：${args.stack.entryPoints.map((p) => `\`${p}\``).join(", ") || "未识别"}`,
    ``,
    `## 文件清单（按层级，**这是你能引用的全部文件路径**）`,
    args.fileTree,
    ``,
    `## 目录设计原则（必须全部遵守）`,
    `1. **章节粒度要细**：每章只攻克一个紧凑的主题。脚手架按类别拆（package / tsconfig / 构建 / lint / git / docs 等各一节）；配置每份配置文件一节；核心抽象与工具每个文件一节；每个源模块先出一节"模块总览"（kind="module-overview"），再为该模块下的**每个文件**单独出一节深挖（kind="module"）。`,
    `2. **总章节数不少于 15 节**；该项目共 ${args.fileCount} 个相关文件、其中 ${args.sourceCount} 个源代码文件。每个源代码文件至少出现在一个 module / module-overview 章节里。`,
    `3. **目录要深**：使用 \`subdir\` 字段把章节组织进多层文件夹——例如 \`01-scaffold\`、\`02-config\`、\`03-core\`、\`04-modules/<模块名>\`、\`05-tests\`、\`06-ship\` 等。`,
    `4. **章节顺序符合依赖梯度**：先脚手架 → 配置 → 核心抽象 → 模块（总览先于该模块的文件深挖）→ 测试 → 出厂。\`deps\` 字段填写本章前置的章节标题（用 "章节id · 标题" 的形式）。`,
    `5. **id 规则**：00 为总览（由系统注入，**不要**在你的输出中再出现 00）；脚手架 01-NN；配置 02-NN；核心 03-NN；模块 04-MM-NN（MM 是模块序号、NN 是模块内章节序号，00 给该模块总览，01+ 给该模块下每个文件）；测试 05-NN；出厂 06-NN。`,
    `6. **slug 规则**：以 id 开头，后接英文小写连字符化的简述，例如 \`04-03-00-overview\`、\`04-03-02-planner\`。`,
    `7. **kind 取值只能是**：\`scaffold\` / \`dependencies\` / \`core\` / \`module-overview\` / \`module\` / \`tests\` / \`deployment\`。`,
    `8. **files 字段**只能写上面"文件清单"里出现过的相对路径；不要发明文件，也不要漏掉任何源代码文件。`,
    `9. **focus 字段**用一两句中文说明本章在攻克什么——后续章节正文会读到它，用来约束自己不要扩散。`,
    ``,
    `## 输出格式（严格 JSON，不要任何前言、不要 markdown 代码围栏）`,
    `{`,
    `  "chapters": [`,
    `    {`,
    `      "id": "01-01",`,
    `      "slug": "01-01-package-json",`,
    `      "title": "子任务 01-01 · 项目清单与命令入口——把骨架立起来",`,
    `      "kind": "scaffold",`,
    `      "section": "脚手架",`,
    `      "subdir": "01-scaffold",`,
    `      "files": ["package.json", "bin/cli.js"],`,
    `      "deps": ["00 · 整体浏览与总任务"],`,
    `      "focus": "本章只关心 package.json + bin 入口注册"`,
    `    }`,
    `    // … 其余章节`,
    `  ]`,
    `}`,
    ``,
    `开始输出 JSON。`,
  ].join("\n");
}

function renderTreeForPrompt(layered: Layered): string {
  const lines: string[] = [];
  const labels: Record<string, string> = {
    L1: "L1 · 脚手架",
    L2: "L2 · 配置与依赖",
    L3: "L3 · 入口与核心抽象",
    L4: "L4 · 业务模块（按模块分桶）",
    L5: "L5 · 测试",
    L6: "L6 · 部署与运维",
  };
  for (const layer of ["L1", "L2", "L3", "L4", "L5", "L6"] as const) {
    const list = layered.byLayer[layer];
    if (!list.length) continue;
    lines.push(`### ${labels[layer]}`);
    if (layer === "L4") {
      const buckets = new Map<string, LayeredFile[]>();
      for (const lf of list) {
        const m = lf.module ?? "core";
        const arr = buckets.get(m) ?? [];
        arr.push(lf);
        buckets.set(m, arr);
      }
      for (const [name, arr] of buckets) {
        lines.push(`- 模块 \`${name}\`（共 ${arr.length} 文件）`);
        for (const lf of arr) lines.push(`  - ${lf.file.relPath}`);
      }
    } else {
      for (const lf of list) lines.push(`- ${lf.file.relPath}`);
    }
  }
  return lines.join("\n");
}

/* ─────────────────────────── JSON parsing / mapping ─────────────────────────── */

function parseOutlineJson(raw: string): { chapters: RawProposal[] } | null {
  // Strip code fences and any leading prose. Pull the first { … } block.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  const slice = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    const obj = JSON.parse(slice) as { chapters?: unknown };
    if (!obj || !Array.isArray(obj.chapters)) return null;
    return { chapters: obj.chapters as RawProposal[] };
  } catch {
    return null;
  }
}

function mapProposalsToChapters(
  parsed: { chapters: RawProposal[] },
  fileIndex: Map<string, LayeredFile>
): Chapter[] | null {
  const out: Chapter[] = [];
  const seenIds = new Set<string>();

  for (const p of parsed.chapters) {
    const id = asString(p.id);
    const slug = asString(p.slug);
    const title = asString(p.title);
    const kind = asString(p.kind);
    if (!id || !slug || !title || !kind) continue;
    if (id === "00" || seenIds.has(id)) continue; // 00 is reserved + reject dup ids
    if (!(ALLOWED_KINDS as readonly string[]).includes(kind)) continue;

    const files = Array.isArray(p.files)
      ? p.files
          .map((x) => (typeof x === "string" ? x : ""))
          .filter(Boolean)
          .map((rel) => fileIndex.get(rel))
          .filter((lf): lf is LayeredFile => Boolean(lf))
      : [];

    // module / module-overview chapters must reference at least one file
    if ((kind === "module" || kind === "module-overview") && files.length === 0) {
      continue;
    }

    seenIds.add(id);
    out.push({
      id,
      slug,
      title,
      kind: kind as ChapterKind,
      files,
      deps: Array.isArray(p.deps)
        ? (p.deps.filter((x) => typeof x === "string") as string[])
        : [],
      subdir: asString(p.subdir) || undefined,
      section: asString(p.section) || undefined,
      module: asString(p.module) || undefined,
      focus: asString(p.focus) || undefined,
    });
  }

  if (out.length === 0) return null;
  return out;
}

/**
 * Files the LLM forgot. Each gets its own one-file deep-dive chapter at the
 * end so coverage is preserved (we promised: every file is reproducible).
 */
function synthesizeOverflowChapters(
  missing: string[],
  fileIndex: Map<string, LayeredFile>
): Chapter[] {
  return missing.map((rel, i) => {
    const lf = fileIndex.get(rel)!;
    const id = `99-${(i + 1).toString().padStart(2, "0")}`;
    const base = path.posix.basename(rel).replace(/\.[^.]+$/, "");
    const slug = `${id}-${slugify(base)}`;
    return {
      id,
      slug,
      title: `兜底子任务 ${id} · 补齐 \`${rel}\``,
      kind: "module" as ChapterKind,
      files: [lf],
      deps: [],
      subdir: "99-overflow",
      section: "兜底补齐",
      focus: `本章兜底补齐 ${rel} 这一文件——LLM 设计目录时遗漏了它。`,
    };
  });
}

function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item"
  );
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
