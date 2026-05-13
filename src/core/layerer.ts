import path from "node:path";
import type { FileEntry } from "./scanner.js";
import type { Stack } from "./stack-detector.js";
import type { DepGraph } from "./dep-graph.js";
import { topoSort } from "./dep-graph.js";

export type Layer = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

export interface LayeredFile {
  file: FileEntry;
  layer: Layer;
  /** for L4, the module bucket (e.g. "auth", "utils") */
  module?: string;
}

export interface Layered {
  byLayer: Record<Layer, LayeredFile[]>;
  topoOrder: string[];
}

const SCAFFOLD_FILES = new Set([
  "package.json", "tsconfig.json", "tsup.config.ts",
  "vite.config.ts", "vite.config.js",
  "webpack.config.js", "rollup.config.js",
  "pyproject.toml", "setup.py", "setup.cfg",
  "go.mod", "Cargo.toml",
  ".eslintrc", ".eslintrc.js", ".eslintrc.json", ".prettierrc",
  ".editorconfig", ".nvmrc",
]);

const CONFIG_PATTERNS = [
  /^\.env(\..+)?\.example$/,
  /^\.env\.sample$/,
  /^config\//,
  /^configs\//,
  /\.config\.(ts|js|json|yaml|yml)$/,
];

const TEST_PATTERNS = [
  /(^|\/)tests?\//,
  /(^|\/)__tests__\//,
  /(^|\/)spec\//,
  /\.(test|spec)\.[jt]sx?$/,
  /\.(test|spec)\.py$/,
  /_test\.go$/,
];

const DEPLOY_PATTERNS = [
  /^Dockerfile$/,
  /^docker-compose\.ya?ml$/,
  /^\.dockerignore$/,
  /^\.github\/workflows\//,
  /^\.gitlab-ci/,
  /^Makefile$/,
];

export function layer(
  files: FileEntry[],
  stack: Stack,
  graph: DepGraph
): Layered {
  const entrySet = new Set(stack.entryPoints.map(normalizeRel));
  const empty: Record<Layer, LayeredFile[]> = {
    L1: [], L2: [], L3: [], L4: [], L5: [], L6: [],
  };

  for (const f of files) {
    const rel = f.relPath;
    let asg: { layer: Layer; module?: string } | undefined;

    if (DEPLOY_PATTERNS.some((re) => re.test(rel))) {
      asg = { layer: "L6" };
    } else if (TEST_PATTERNS.some((re) => re.test(rel))) {
      asg = { layer: "L5" };
    } else if (SCAFFOLD_FILES.has(rel)) {
      asg = { layer: "L1" };
    } else if (CONFIG_PATTERNS.some((re) => re.test(rel))) {
      asg = { layer: "L2" };
    } else if (entrySet.has(rel)) {
      asg = { layer: "L3" };
    } else if (isCoreUtil(rel)) {
      asg = { layer: "L3" };
    } else if (isSourceFile(f)) {
      asg = { layer: "L4", module: moduleOf(rel) };
    } else if (isDocFile(rel)) {
      asg = { layer: "L1" };
    } else {
      asg = { layer: "L2" };
    }

    empty[asg.layer].push({ file: f, layer: asg.layer, module: asg.module });
  }

  const allRel = files.map((f) => f.relPath);
  const topoOrder = topoSort(graph, allRel);

  // Sort L4 by topo order so dependent files come after dependencies
  const orderIndex = new Map(topoOrder.map((p, i) => [p, i]));
  empty.L4.sort(
    (a, b) =>
      (orderIndex.get(a.file.relPath) ?? 0) -
      (orderIndex.get(b.file.relPath) ?? 0)
  );

  return { byLayer: empty, topoOrder };
}

function isCoreUtil(rel: string): boolean {
  return /^src\/(utils?|lib|common|shared|types?|constants?)\//.test(rel);
}

function isSourceFile(f: FileEntry): boolean {
  const SRC = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs"];
  return SRC.includes(f.ext);
}

function isDocFile(rel: string): boolean {
  const base = path.posix.basename(rel).toLowerCase();
  return base === "readme.md" || rel.toLowerCase().startsWith("docs/");
}

function moduleOf(rel: string): string {
  const parts = rel.split("/");
  if (parts[0] === "src" && parts.length > 2) return parts[1] ?? "core";
  if (parts.length > 1) return parts[0] ?? "core";
  return "core";
}

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}
