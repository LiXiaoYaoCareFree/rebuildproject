import Handlebars from "handlebars";

/**
 * Prompt templates centralized. The handbook is not a recipe book — it must
 * teach the **思路 / 重点 / 难点 / 精髓** behind every chapter, not just steps.
 */

export const SYSTEM_TEMPLATE = `你是一名资深工程师 + 技术作者，正在为读者写一份**项目搭建实战课**。读者目标不是"了解"项目，而是要**掌握**这个项目是怎么一步步被设计出来、搭建出来、打磨出来的——从中学到可迁移的工程精髓。

写作纪律（缺一不可）：
1. **教思路，不只是给步骤**。每章要回答："要解决什么问题？有哪些可行解？为什么选这个？"
2. **突出重点**。每章必须明确点出 2-4 个最关键的设计决策/抽象/模式，并解释为什么这是重点。
3. **解析难点**。每章必须挑出 1-3 个最容易踩坑或反直觉的地方：朴素方案为什么不行？这里隐藏了什么前提？
4. **代码必须完整**。操作步骤里出现的每个文件，都给出**完整内容**用三个反引号代码块包裹（首行写 \`lang:相对路径\`），读者复制完即得到与原项目逐字节一致的副本。绝不写 \"// ..."、"# 省略"、"truncated" 之类的占位符。
5. **提炼精髓**。每章末尾用一段话写出"跳出本项目，这一章学到的可迁移原则是什么"。
6. 用 {{language}} 输出。语气直接、自信、可操作；不要套话、不要重复读者已知的术语解释。
7. 引用前置章节时明确写"本章假设你已经完成《章节标题》"。`;

export const OVERVIEW_TEMPLATE = `为搭建实战课写《00 · 立意与全景》一章。

## 项目栈速览
- 语言/运行时：{{stack.language}} / {{stack.runtime}}
- 包管理 / 构建：{{stack.packageManager}} / {{stack.buildTool}}
- 框架：{{#each stack.frameworks}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
- 测试：{{#each stack.testFrameworks}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
- 入口：{{#each stack.entryPoints}}\`{{this}}\`{{#unless @last}}, {{/unless}}{{/each}}

## 文件全景（按层级）
{{fileTree}}

## 章节地图
{{chaptersMap}}

## 输出要求

# 00 · 立意与全景

## 项目意图
（这个项目要解决什么问题？为谁解决？目标用户的痛点是什么？不要复述 README，要从代码反推出真实意图）

## 全景与边界
（这个项目**做了**什么、**不做**什么。用一段话画出系统边界）

## 架构鸟瞰
\`\`\`mermaid
（画一张组件/数据流图，标出关键模块和数据走向）
\`\`\`

## 关键设计决策（这是全书的"灯塔"）
（列出 3-5 条贯穿全书的核心设计决策，每条形如：**决策 X**：选择 A 而不是 B，因为 ⋯⋯）

## 重难点地图
（列出后续章节中最值得重点突破的 3-5 个章节/模块，并简述各自的难点是什么——告诉读者哪里要慢读）

## 学习路线
（按章节顺序写明每章读完会**掌握**什么能力——不是"了解"，是"能独立动手"）

## 准备工作
（动手前要装好的工具，版本要求）

直接输出 markdown，不要前言。`;

export const CHAPTER_TEMPLATE = `为搭建实战课写《{{chapter.id}} · {{chapter.title}}》一章。

## 上下文
- 项目主语言：{{stack.language}}（{{stack.runtime}}）
- 包管理器：{{stack.packageManager}}
- 本章类型：{{chapter.kind}}
{{#if hasDeps}}
- 前置章节：{{#each chapter.deps}}《{{this}}》{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}

## 本章涉及的源文件（必须**完整**呈现以下每个文件的内容；不要省略，不要写占位符）
{{#each filesContent}}
### \`{{this.path}}\`
\`\`\`{{this.lang}}
{{this.content}}
\`\`\`

{{/each}}

## 输出要求（必须包含以下所有小节，缺一不可）

# {{chapter.id}} · {{chapter.title}}

## 目标
（本章读完，读者能独立**做出**什么、**理解**什么——具体能力，不要写"了解"。）

## 前置
{{#if hasDeps}}
（提醒读者已完成的前置章节，以及读者现在手上应该已经有的产物）
{{else}}
（无前置时写"无；这是动手第一站"）
{{/if}}

## 设计思路
（这一章要解决什么具体问题？有哪些可选方案？最终为什么选这一种？把 trade-off 讲透——这是全章最值得花字数的地方之一。）

## 重点（2-4 个）
（每个重点用 \`### 重点 N · 标题\` 起小节。明确说"为什么这是重点"——它驱动了哪些设计、影响了哪些后续章节。）

## 难点（1-3 个）
（每个难点用 \`### 难点 N · 标题\` 起小节。讲清：直觉解法是什么？为什么直觉解法不行？正确解法的关键洞察是什么？）

## 实现步骤
（按依赖顺序逐文件给出完整代码。每个文件用 \`### 文件：\\\`相对路径\\\`\` 起小节，紧接一段"为什么是这些代码"的简述，再放完整代码块——首行格式为 \`\`\`lang:相对路径，例如：
\`\`\`ts:src/foo.ts
（完整内容）
\`\`\`
不省略，不占位。）

## 精髓
（一段话：跳出本项目，这一章可迁移的工程原则是什么？读者明天去写别的项目能用上什么？）

## 验证
（具体命令；看到什么输出/状态算成功；常见报错的快速排查思路）

直接输出 markdown，不要前言。`;

let registered = false;
function register() {
  if (registered) return;
  Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);
  registered = true;
}

export function renderSystem(language: "zh" | "en"): string {
  register();
  return Handlebars.compile(SYSTEM_TEMPLATE)({
    language: language === "zh" ? "中文" : "English",
  });
}

export function renderOverview(ctx: Record<string, unknown>): string {
  register();
  return Handlebars.compile(OVERVIEW_TEMPLATE)(ctx);
}

export function renderChapter(ctx: Record<string, unknown>): string {
  register();
  return Handlebars.compile(CHAPTER_TEMPLATE)({
    ...ctx,
    hasDeps:
      Array.isArray((ctx as { chapter?: { deps?: unknown[] } }).chapter?.deps) &&
      ((ctx as { chapter: { deps: unknown[] } }).chapter.deps.length > 0),
  });
}
