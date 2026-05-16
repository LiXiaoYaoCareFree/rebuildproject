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

export function getOutDir(cwd: string): string {
  return path.join(cwd, OUT_DIR);
}

export function chapterRelPath(c: Chapter): string {
  return c.subdir ? `${c.subdir}/${c.slug}.md` : `${c.slug}.md`;
}

/**
 * Write a single chapter (or the overview) to disk. Safe to call multiple
 * times during Author so the rebuild-guide/ directory grows visibly while
 * the run is in progress, instead of materializing only at Compose.
 */
export async function writeChapterFile(
  outDir: string,
  c: Chapter,
  md: string
): Promise<string> {
  const target = path.join(outDir, chapterRelPath(c));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, md, "utf8");
  return target;
}

/** Write the book's front matter / TOC. Called once early in Author. */
export async function writeReadme(outDir: string, plan: Plan): Promise<void> {
  const tocLines: string[] = [
    "# 项目搭建实战课",
    "",
    "> 这是一本**项目搭建之书**：从第一章空目录开始，到最后一章合上书时，你会得到一个与原项目逐字节一致的副本——同时掌握其中用到的每一项技术。",
    "",
    "## 整本书的承诺",
    "",
    "- **从头到尾完整可还原**：每一章给出涉及文件的**完整内容**，你只需要按顺序复制粘贴。中间不留洞。",
    "- **既是步骤也是知识点**：每一章新出现的库/工具/概念都当成知识点讲清楚——一句话定义、设计动机、官方推荐用法、本项目里的具体用法。",
    "- **首尾相接的子任务链**：第 N 章结尾的产物等于第 N+1 章开头的前置。每章都标注「子任务定位」与「串通下一站」。",
    "- **做中学**：每章末尾给立即可执行的验证命令——跑通了再翻下一页。",
    "",
    "## 目录",
    "",
  ];
  // Group chapters by `section` so the TOC reads like a real table of
  // contents — top-level sections (脚手架 / 配置 / 核心 / 模块 / 测试 / …)
  // with nested chapter links. Chapters without a section are listed flat.
  const grouped = new Map<string, typeof plan.chapters>();
  const flatTail: typeof plan.chapters = [];
  for (const c of plan.chapters) {
    const sec = c.section?.trim();
    if (!sec) {
      flatTail.push(c);
      continue;
    }
    const list = grouped.get(sec) ?? [];
    list.push(c);
    grouped.set(sec, list);
  }
  for (const [section, list] of grouped) {
    tocLines.push(`### ${section}`);
    tocLines.push("");
    for (const c of list) {
      tocLines.push(`- [${c.id} · ${c.title}](./${chapterRelPath(c)})`);
    }
    tocLines.push("");
  }
  for (const c of flatTail) {
    tocLines.push(`- [${c.id} · ${c.title}](./${chapterRelPath(c)})`);
  }
  tocLines.push(
    "",
    "## 怎么读这本书",
    "",
    "1. **按顺序，不要跳读**。每章的前置都是上一章的产物；跳读会让你陷入「为什么这里突然有这个文件」的困惑。",
    "2. **每章末尾的验证必须跑通**再进入下一章。错误在工程里是会累积复利的，越早发现越省时间。",
    "3. **遇到知识点小节慢读**——那里讲的是「为什么直觉解法不对」，是工程能力增长最快的地方。",
    "4. **完成最后一章**：你拥有一个能跑起来的完整项目，也拥有了一份可迁移到任何新项目的工程心法。",
    ""
  );
  await fs.writeFile(path.join(outDir, "README.md"), tocLines.join("\n"), "utf8");
}

export async function ensureOutDir(cwd: string): Promise<string> {
  const out = getOutDir(cwd);
  await fs.mkdir(out, { recursive: true });
  return out;
}

/**
 * Final pass at Compose: re-writes README (in case plan changed mid-run)
 * and back-fills any chapter that wasn't already written by Author.
 */
export async function writeGuide(input: WriteInput): Promise<string> {
  const out = await ensureOutDir(input.cwd);
  await writeReadme(out, input.plan);

  const overviewChapter = input.plan.chapters.find((c) => c.kind === "overview");
  if (overviewChapter) {
    await writeChapterFile(out, overviewChapter, input.overviewMarkdown);
  }

  for (const c of input.plan.chapters) {
    if (c.kind === "overview") continue;
    const md = input.chapterMarkdowns.get(c.slug);
    if (!md) continue;
    await writeChapterFile(out, c, md);
  }

  return out;
}
