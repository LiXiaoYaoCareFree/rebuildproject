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
  /** prior chapter slugs to reference */
  deps: string[];
  /** for module chapters, place under modules/ subdir */
  subdir?: string;
}

export interface Plan {
  stack: Stack;
  chapters: Chapter[];
}

export function planChapters(layered: Layered, stack: Stack): Plan {
  const chapters: Chapter[] = [];

  // 00 立意：从代码反推真实意图、画出架构、铺开学习路线
  chapters.push({
    id: "00",
    slug: "00-intent",
    title: "立意与全景：这个项目到底在做什么",
    kind: "overview",
    files: [],
    deps: [],
  });

  // 01 选型：脚手架 = 选什么栈、怎么初始化项目、为什么这么选
  if (layered.byLayer.L1.length) {
    chapters.push({
      id: "01",
      slug: "01-stack-and-scaffold",
      title: "选型与脚手架：栈为什么这么挑",
      kind: "scaffold",
      files: layered.byLayer.L1,
      deps: ["00-intent"],
    });
  }

  // 02 配置 / 依赖 / 契约
  if (layered.byLayer.L2.length) {
    chapters.push({
      id: "02",
      slug: "02-deps-and-config",
      title: "依赖与配置：把工程跑起来的全部基础",
      kind: "dependencies",
      files: layered.byLayer.L2,
      deps: ["01-stack-and-scaffold"],
    });
  }

  // 03 核心抽象：入口 + 工具 + 跨模块契约
  if (layered.byLayer.L3.length) {
    chapters.push({
      id: "03",
      slug: "03-core-abstractions",
      title: "核心抽象：入口、契约与跨模块语言",
      kind: "core",
      files: layered.byLayer.L3,
      deps: ["02-deps-and-config"],
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
      title: `模块深挖 · ${name}：思路、重点、难点`,
      kind: "module",
      files: list,
      deps: ["03-core-abstractions"],
      subdir: "04-modules",
    });
  }

  // 05 韧性与测试：错误路径、边界、回归保护
  if (layered.byLayer.L5.length) {
    chapters.push({
      id: "05",
      slug: "05-resilience-and-tests",
      title: "韧性与测试：守住边界，防止退化",
      kind: "tests",
      files: layered.byLayer.L5,
      deps: chapters.filter((c) => c.kind === "module").map((c) => c.slug),
    });
  }

  // 06 出厂：构建、部署、CI、可观测
  if (layered.byLayer.L6.length) {
    chapters.push({
      id: "06",
      slug: "06-ship-and-ops",
      title: "出厂与运维：从 main 分支到生产环境",
      kind: "deployment",
      files: layered.byLayer.L6,
      deps: chapters.filter((c) => c.kind !== "overview").map((c) => c.slug),
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
