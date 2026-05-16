import path from "node:path";
import type { Layered, LayeredFile } from "./layerer.js";
import type { Stack } from "./stack-detector.js";

export type ChapterKind =
  | "overview"
  | "scaffold"
  | "dependencies"
  | "core"
  | "module-overview"
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
  /** subdir under rebuild-guide/ where the chapter lives (supports nested paths) */
  subdir?: string;
  /** logical section the chapter belongs to (for TOC grouping) */
  section?: string;
  /** module name for module-overview / module chapters */
  module?: string;
  /** extra hint copy fed into the chapter prompt (e.g. "this chapter covers ONLY file X") */
  focus?: string;
}

export interface Plan {
  stack: Stack;
  chapters: Chapter[];
}

/* ─────────────────────────── Scaffold categorisation ─────────────────────────── */

const SCAFFOLD_CATEGORIES: Array<{
  key: string;
  title: string;
  match: (rel: string) => boolean;
}> = [
  {
    key: "package",
    title: "项目清单与命令入口",
    match: (r) =>
      r === "package.json" ||
      r === "pyproject.toml" ||
      r === "setup.py" ||
      r === "setup.cfg" ||
      r === "go.mod" ||
      r === "Cargo.toml" ||
      r.startsWith("bin/"),
  },
  {
    key: "ts-config",
    title: "类型与编译器配置",
    match: (r) => r === "tsconfig.json" || /^tsconfig\..+\.json$/.test(r),
  },
  {
    key: "build",
    title: "构建产物配置",
    match: (r) =>
      r === "tsup.config.ts" ||
      r === "vite.config.ts" ||
      r === "vite.config.js" ||
      r === "webpack.config.js" ||
      r === "rollup.config.js",
  },
  {
    key: "lint-format",
    title: "Lint / Format / 编辑器一致性",
    match: (r) =>
      /^\.eslintrc(\..+)?$/.test(r) ||
      r === ".prettierrc" ||
      r === ".editorconfig" ||
      r === ".nvmrc",
  },
  {
    key: "vcs",
    title: "版本控制忽略与 CI 入口",
    match: (r) => r === ".gitignore" || r === ".gitattributes",
  },
  {
    key: "docs-license",
    title: "说明文档与许可证",
    match: (r) =>
      /^README(\..+)?$/i.test(r) ||
      r === "LICENSE" ||
      r === "LICENSE.md" ||
      r === "NOTICE",
  },
];

/* ─────────────────────────── Public entry ─────────────────────────── */

/**
 * The planner produces a *fine-grained* chapter list. The output guarantees:
 *
 *   • Scaffold/Config/Core are split per logical group instead of one big chapter,
 *     so every concept lands in its own page.
 *   • Each source module becomes a folder under `04-modules/<module>/` with
 *     ① a `module-overview` chapter that introduces the module's role and
 *        internal graph (no full file dump), then
 *     ② one chapter per file (or per tightly-coupled pair) drilling into the
 *        file's responsibilities.
 *   • The book TOC reads like a real table of contents: top-level sections
 *     (Scaffold / Config / Core / Modules / Tests / Ship) with nested chapters
 *     beneath them.
 *
 * Target depth: for any non-trivial codebase the planner will emit ≥20 chapters
 * so the reader can navigate one concept at a time.
 */
export function planChapters(layered: Layered, _stack: Stack): Plan {
  const chapters: Chapter[] = [];

  // ── 00 · overview ──────────────────────────────────────────────────────────
  chapters.push({
    id: "00",
    slug: "00-intent",
    title: "整体浏览与总任务：你接下来要重建什么",
    kind: "overview",
    files: [],
    deps: [],
    section: "总览",
  });

  // ── 01 · scaffold (split by category) ──────────────────────────────────────
  const scaffoldBuckets = bucketScaffold(layered.byLayer.L1);
  let scaffoldIdx = 0;
  for (const bucket of scaffoldBuckets) {
    if (bucket.files.length === 0) continue;
    scaffoldIdx++;
    const id = `01-${pad(scaffoldIdx, 2)}`;
    chapters.push({
      id,
      slug: `${id}-${slugify(bucket.key)}`,
      title: `子任务 ${id} · ${bucket.title}——把骨架立起来`,
      kind: "scaffold",
      files: bucket.files,
      deps: ["00 · 整体浏览与总任务"],
      subdir: "01-scaffold",
      section: "脚手架",
    });
  }
  const scaffoldDoneLabel = scaffoldIdx
    ? `01-* · 全部脚手架（共 ${scaffoldIdx} 节）`
    : "00 · 整体浏览与总任务";

  // ── 02 · deps & config (one chapter per file) ──────────────────────────────
  const l2Files = [...layered.byLayer.L2];
  let configIdx = 0;
  for (const lf of l2Files) {
    configIdx++;
    const id = `02-${pad(configIdx, 2)}`;
    const baseName = path.posix.basename(lf.file.relPath);
    chapters.push({
      id,
      slug: `${id}-${slugify(baseName.replace(/\.[^.]+$/, ""))}`,
      title: `子任务 ${id} · 配置项 \`${baseName}\`——让工程能跑起来`,
      kind: "dependencies",
      files: [lf],
      deps: [scaffoldDoneLabel],
      subdir: "02-config",
      section: "依赖与配置",
      focus: `本章只关注 ${lf.file.relPath} 这一份配置：它是干什么的、为什么需要、字段含义。`,
    });
  }
  const configDoneLabel = configIdx
    ? `02-* · 全部依赖与配置（共 ${configIdx} 节）`
    : scaffoldDoneLabel;

  // ── 03 · core abstractions (one chapter per file) ─────────────────────────
  const l3Files = [...layered.byLayer.L3];
  let coreIdx = 0;
  for (const lf of l3Files) {
    coreIdx++;
    const id = `03-${pad(coreIdx, 2)}`;
    const baseName = path.posix.basename(lf.file.relPath);
    chapters.push({
      id,
      slug: `${id}-${slugify(baseName.replace(/\.[^.]+$/, ""))}`,
      title: `子任务 ${id} · 核心抽象 \`${lf.file.relPath}\`——铺好跨模块的"语言"`,
      kind: "core",
      files: [lf],
      deps: [configDoneLabel],
      subdir: "03-core",
      section: "核心抽象",
      focus: `本章只剖析 ${lf.file.relPath} 这一文件——它的职责、关键导出、为什么放在这一层。`,
    });
  }
  const coreDoneLabel = coreIdx
    ? `03-* · 全部核心抽象（共 ${coreIdx} 节）`
    : configDoneLabel;

  // ── 04 · modules (overview + per-file deep dives) ─────────────────────────
  const moduleBuckets = groupBy(layered.byLayer.L4, (lf) => lf.module ?? "core");
  let moduleIdx = 0;
  for (const [moduleName, list] of moduleBuckets) {
    if (list.length === 0) continue;
    moduleIdx++;
    const modId = pad(moduleIdx, 2);
    const moduleSlug = slugify(moduleName);
    const moduleSubdir = `04-modules/${moduleSlug}`;

    // ① module overview (only if the module has ≥2 files — otherwise the file
    //    chapter alone is enough and an overview would be filler)
    if (list.length >= 2) {
      const id = `04-${modId}-00`;
      chapters.push({
        id,
        slug: `${id}-overview`,
        title: `子任务 ${id} · 模块《${moduleName}》总览——边界、职责、内部地图`,
        kind: "module-overview",
        files: list,
        deps: [coreDoneLabel],
        subdir: moduleSubdir,
        section: `模块 · ${moduleName}`,
        module: moduleName,
        focus: `本章不重复列文件代码，只交付：这个模块在系统里负责什么 / 内部分几块 / 文件之间怎么协作 / 哪些是入口、哪些是内部细节。`,
      });
    }

    // ② per-file deep dives
    let fileIdx = 0;
    for (const lf of list) {
      fileIdx++;
      const id = `04-${modId}-${pad(fileIdx, 2)}`;
      const baseName = path.posix.basename(lf.file.relPath);
      const titleName = baseName.replace(/\.[^.]+$/, "");
      chapters.push({
        id,
        slug: `${id}-${slugify(titleName)}`,
        title: `子任务 ${id} · 模块《${moduleName}》· 文件 \`${baseName}\`——深挖`,
        kind: "module",
        files: [lf],
        deps:
          list.length >= 2
            ? [`04-${modId}-00 · ${moduleName} 总览`]
            : [coreDoneLabel],
        subdir: moduleSubdir,
        section: `模块 · ${moduleName}`,
        module: moduleName,
        focus: `本章只攻克一个文件：${lf.file.relPath}。讲清它解决什么问题、关键设计、内部难点，并完整给出代码。`,
      });
    }
  }
  const modulesDoneLabel = moduleIdx
    ? `04-* · 全部模块（共 ${moduleIdx} 个模块）`
    : coreDoneLabel;

  // ── 05 · tests (one chapter per test file when feasible) ──────────────────
  const l5Files = [...layered.byLayer.L5];
  let testsIdx = 0;
  for (const lf of l5Files) {
    testsIdx++;
    const id = `05-${pad(testsIdx, 2)}`;
    const baseName = path.posix.basename(lf.file.relPath);
    chapters.push({
      id,
      slug: `${id}-${slugify(baseName.replace(/\.[^.]+$/, ""))}`,
      title: `子任务 ${id} · 测试 \`${lf.file.relPath}\`——守住边界`,
      kind: "tests",
      files: [lf],
      deps: [modulesDoneLabel],
      subdir: "05-tests",
      section: "韧性与测试",
      focus: `本章只剖析这一份测试：它在断言什么、覆盖了哪条主路径或哪条边界、如何防止回归。`,
    });
  }
  const testsDoneLabel = testsIdx
    ? `05-* · 全部测试（共 ${testsIdx} 节）`
    : modulesDoneLabel;

  // ── 06 · ship & ops (one chapter per artifact) ────────────────────────────
  const l6Files = [...layered.byLayer.L6];
  let shipIdx = 0;
  for (const lf of l6Files) {
    shipIdx++;
    const id = `06-${pad(shipIdx, 2)}`;
    const baseName = path.posix.basename(lf.file.relPath);
    chapters.push({
      id,
      slug: `${id}-${slugify(baseName.replace(/\.[^.]+$/, ""))}`,
      title: `子任务 ${id} · 出厂工件 \`${lf.file.relPath}\`——从仓库到生产`,
      kind: "deployment",
      files: [lf],
      deps: [testsDoneLabel],
      subdir: "06-ship",
      section: "出厂与运维",
      focus: `本章只讲这一份运维工件——它在交付链路里的位置、关键字段、常见踩坑。`,
    });
  }

  return { stack: _stack, chapters };
}

/* ─────────────────────────── Helpers ─────────────────────────── */

interface ScaffoldBucket {
  key: string;
  title: string;
  files: LayeredFile[];
}

function bucketScaffold(files: LayeredFile[]): ScaffoldBucket[] {
  const buckets: ScaffoldBucket[] = SCAFFOLD_CATEGORIES.map((c) => ({
    key: c.key,
    title: c.title,
    files: [],
  }));
  const misc: ScaffoldBucket = { key: "misc", title: "其他脚手架文件", files: [] };

  for (const lf of files) {
    const cat = SCAFFOLD_CATEGORIES.findIndex((c) => c.match(lf.file.relPath));
    if (cat >= 0) {
      buckets[cat]!.files.push(lf);
    } else {
      misc.files.push(lf);
    }
  }

  const result = buckets.filter((b) => b.files.length > 0);
  if (misc.files.length > 0) result.push(misc);
  return result;
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
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

function pad(n: number, w: number): string {
  return n.toString().padStart(w, "0");
}
