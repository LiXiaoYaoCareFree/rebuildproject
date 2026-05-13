import { promises as fs } from "node:fs";
import path from "node:path";
import type { Plan, Chapter } from "./planner.js";

const OUT_DIR = "rebuild-guide";

export interface WriteInput {
  cwd: string;
  plan: Plan;
  overviewMarkdown: string;
  chapterMarkdowns: Map<string, string>;
}

export async function writeGuide(input: WriteInput): Promise<string> {
  const out = path.join(input.cwd, OUT_DIR);
  await fs.mkdir(out, { recursive: true });

  // README index
  const tocLines: string[] = [
    "# 项目搭建手册",
    "",
    "跟着这本手册一步一步操作，你将从零搭建出一个与原项目代码完全一致的复制品。",
    "",
    "## 阅读顺序",
    "",
  ];
  for (const c of input.plan.chapters) {
    const rel = chapterRelPath(c);
    tocLines.push(`- [${c.id} · ${c.title}](./${rel})`);
  }
  tocLines.push("", "## 怎么用这本手册", "", "1. 按章节顺序阅读，每章读完后照着【操作步骤】里的代码块新建文件。", "2. 每章末尾的【验证】会告诉你这一步做完后该跑什么命令。", "3. 通读完最后一章，你会得到一个能跑起来的项目。");

  await fs.writeFile(path.join(out, "README.md"), tocLines.join("\n"), "utf8");

  // Overview chapter
  const overviewChapter = input.plan.chapters.find((c) => c.kind === "overview");
  if (overviewChapter) {
    await writeChapterFile(out, overviewChapter, input.overviewMarkdown);
  }

  // Other chapters
  for (const c of input.plan.chapters) {
    if (c.kind === "overview") continue;
    const md = input.chapterMarkdowns.get(c.slug);
    if (!md) continue;
    await writeChapterFile(out, c, md);
  }

  return out;
}

function chapterRelPath(c: Chapter): string {
  return c.subdir ? `${c.subdir}/${c.slug}.md` : `${c.slug}.md`;
}

async function writeChapterFile(
  outDir: string,
  c: Chapter,
  md: string
): Promise<void> {
  const target = path.join(outDir, chapterRelPath(c));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, md, "utf8");
}
