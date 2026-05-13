import type { Layered, LayeredFile } from "./layerer.js";
import type { Stack } from "./stack-detector.js";

export type ChapterKind =
  | "overview"
  | "scaffold"
  | "dependencies"
  | "core"
  | "module"
  | "tests"
  | "deployment";

export interface Chapter {
  id: string;
  /** filename without extension, e.g. "00-overview" */
  slug: string;
  title: string;
  kind: ChapterKind;
  /** files included as full content */
  files: LayeredFile[];
  /** prior chapter labels (readable string) to reference */
  deps: string[];
  /** for module chapters, place under modules/ subdir */
  subdir?: string;
}

export interface Plan {
  stack: Stack;
  chapters: Chapter[];
}

/**
 * Planner produces a sequence of chapters that double as "子任务"——a
 * curriculum where each chapter delivers a concrete artifact and unlocks
 * the next one. Titles are written so the running heading reads:
 *
 *   "# 01 · 子任务 01 · 选型与脚手架——把骨架立起来"
 *
 * That phrasing keeps the "做中学" subtask chain visible in every page.
 */
export function planChapters(layered: Layered, stack: Stack): Plan {
  const chapters: Chapter[] = [];

  // 00 立意：从代码反推真实意图、画出架构、铺开学习路线 + 提出总任务 + 拆子任务
  chapters.push({
    id: "00",
    slug: "00-intent",
    title: "整体浏览与总任务：你接下来要重建什么",
    kind: "overview",
    files: [],
    deps: [],
  });

  // 01 选型：脚手架 = 选什么栈、怎么初始化项目、为什么这么选
  if (layered.byLayer.L1.length) {
    chapters.push({
      id: "01",
      slug: "01-stack-and-scaffold",
      title: "子任务 01 · 选型与脚手架——把骨架立起来",
      kind: "scaffold",
      files: layered.byLayer.L1,
      deps: ["00 · 整体浏览与总任务"],
    });
  }

  // 02 配置 / 依赖 / 契约
  if (layered.byLayer.L2.length) {
    chapters.push({
      id: "02",
      slug: "02-deps-and-config",
      title: "子任务 02 · 依赖与配置——把工程跑起来",
      kind: "dependencies",
      files: layered.byLayer.L2,
      deps: ["01 · 选型与脚手架"],
    });
  }

  // 03 核心抽象：入口 + 工具 + 跨模块契约
  if (layered.byLayer.L3.length) {
    chapters.push({
      id: "03",
      slug: "03-core-abstractions",
      title: `子任务 03 · 核心抽象——铺好跨模块的"语言"`,
      kind: "core",
      files: layered.byLayer.L3,
      deps: ["02 · 依赖与配置"],
    });
  }

  // 04-* 模块逐深：每个模块独立一章，按依赖序进入
  const moduleBuckets = groupBy(layered.byLayer.L4, (lf) => lf.module ?? "core");
  let idx = 0;
  for (const [name, list] of moduleBuckets) {
    if (list.length === 0) continue;
    const id = `04-${pad(idx++, 2)}`;
    chapters.push({
      id,
      slug: `${id}-${slugify(name)}`,
      title: `子任务 ${id} · 模块深挖：${name}——把血肉填进骨架`,
      kind: "module",
      files: list,
      deps: ["03 · 核心抽象"],
      subdir: "04-modules",
    });
  }

  // 05 韧性与测试：错误路径、边界、回归保护
  if (layered.byLayer.L5.length) {
    const modDeps = chapters
      .filter((c) => c.kind === "module")
      .map((c) => c.id);
    chapters.push({
      id: "05",
      slug: "05-resilience-and-tests",
      title: "子任务 05 · 韧性与测试——守住边界，防止退化",
      kind: "tests",
      files: layered.byLayer.L5,
      deps: modDeps.length
        ? [`04-* · 全部模块（${modDeps.join(", ")}）`]
        : ["03 · 核心抽象"],
    });
  }

  // 06 出厂：构建、部署、CI、可观测
  if (layered.byLayer.L6.length) {
    chapters.push({
      id: "06",
      slug: "06-ship-and-ops",
      title: "子任务 06 · 出厂与运维——从 main 分支到生产环境",
      kind: "deployment",
      files: layered.byLayer.L6,
      deps: ["前面全部子任务"],
    });
  }

  return { stack, chapters };
}

function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of arr) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "module";
}

function pad(n: number, w: number): string {
  return n.toString().padStart(w, "0");
}
