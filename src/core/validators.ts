import type { Chapter } from "./planner.js";

export interface ValidationIssue {
  kind: "missing-section" | "missing-file-block" | "placeholder-detected";
  detail: string;
}

export interface ChapterValidation {
  ok: boolean;
  issues: ValidationIssue[];
}

/**
 * Each chapter must teach 子任务定位 / 思路 / 知识点 / 重点 / 难点 / 实现 /
 * 做中学验证 / 精髓 / 串通下一站 — not just dump steps. The validator enforces
 * the contract; failures get sent back to the AI for repair (see
 * pipeline/steps/author.ts).
 */
const DEPTH_SECTIONS = [
  "子任务定位",
  "设计思路",
  "知识点",       // matches "知识点介绍" or "知识点小课" etc.
  "重点",
  "难点",
  "实现步骤",
  "验证",         // matches "做中学验证" or "验证"
  "精髓",
  "串通",         // matches "串通下一站"
];

/**
 * Module-overview is a *map* chapter: it explains the module's boundaries and
 * internal graph but deliberately does NOT dump every file (per-file deep dives
 * follow). So we ask for navigation-oriented sections instead of 实现步骤.
 */
const MODULE_OVERVIEW_SECTIONS = [
  "子任务定位",
  "模块职责",
  "内部结构",      // matches "内部结构图" / "内部结构与协作"
  "文件清单",      // matches "文件清单与阅读顺序"
  "阅读顺序",
  "精髓",
  "串通",
];

const OVERVIEW_REQUIRED_SECTIONS = [
  "项目意图",
  "总任务",
  "整体浏览",
  "子任务拆解",
  "子任务依赖",
  "关键设计决策",
  "关键技术",       // matches "贯穿全书的关键技术清单"
  "重难点地图",
  "学习路线",
  "准备工作",
];

const REQUIRED_SECTIONS_BY_KIND: Record<string, string[]> = {
  scaffold:          ["目标", ...DEPTH_SECTIONS],
  dependencies:      ["目标", ...DEPTH_SECTIONS],
  core:              ["目标", ...DEPTH_SECTIONS],
  module:            ["目标", "前置", ...DEPTH_SECTIONS],
  "module-overview": MODULE_OVERVIEW_SECTIONS,
  tests:             ["目标", ...DEPTH_SECTIONS],
  deployment:        ["目标", ...DEPTH_SECTIONS],
  overview:          OVERVIEW_REQUIRED_SECTIONS,
};

const PLACEHOLDER_PATTERNS = [
  /\/\/\s*\.\.\.\s*(rest|unchanged|truncated|省略|其余)/i,
  /#\s*\.\.\.\s*(其余|省略|truncated)/i,
  /\/\*\s*(\.\.\.|省略|truncated)\s*\*\//i,
  /<\s*\.\.\.\s*>/,
];

export function validateChapter(
  markdown: string,
  chapter: Chapter
): ChapterValidation {
  const issues: ValidationIssue[] = [];

  // 1. required sections
  const required = REQUIRED_SECTIONS_BY_KIND[chapter.kind] ?? [];
  for (const sec of required) {
    if (!hasSection(markdown, sec)) {
      issues.push({
        kind: "missing-section",
        detail: `缺少必备小节「${sec}」`,
      });
    }
  }

  // 2. every file in this chapter must appear as a fenced code block tagged
  //    with its path — but module-overview chapters are *maps* (no per-file
  //    code dump), so we skip the block check for them.
  if (chapter.kind !== "module-overview") {
    for (const lf of chapter.files) {
      if (!hasFileBlock(markdown, lf.file.relPath)) {
        issues.push({
          kind: "missing-file-block",
          detail: `缺少文件 \`${lf.file.relPath}\` 的完整代码块（要求形如 \`\`\`lang:${lf.file.relPath}）`,
        });
      }
    }
  }

  // 3. obvious placeholders that defeat the "fully reproducible" goal
  for (const pat of PLACEHOLDER_PATTERNS) {
    const m = markdown.match(pat);
    if (m) {
      issues.push({
        kind: "placeholder-detected",
        detail: `检测到占位符 \`${m[0]}\`——必须给完整代码`,
      });
      break;
    }
  }

  return { ok: issues.length === 0, issues };
}

function hasSection(md: string, name: string): boolean {
  // matches `## 目标`, `### 目标`, etc.
  const re = new RegExp(`^#{1,6}\\s+.*${escapeRe(name)}`, "m");
  return re.test(md);
}

function hasFileBlock(md: string, relPath: string): boolean {
  // matches ```anything:relPath  (allow trailing spaces)
  const escaped = escapeRe(relPath);
  const re = new RegExp("```[\\w+-]*:" + escaped + "\\s*$", "m");
  return re.test(md);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function summarizeIssues(issues: ValidationIssue[]): string {
  return issues.map((i, idx) => `${idx + 1}. ${i.detail}`).join("\n");
}
