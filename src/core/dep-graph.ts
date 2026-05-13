import path from "node:path";
import type { FileEntry } from "./scanner.js";

export interface DepGraph {
  /** key: relPath, value: relPaths it depends on (only intra-repo) */
  edges: Map<string, Set<string>>;
}

const SRC_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py",
  ".go",
  ".rs",
]);

const IMPORT_REGEXES: RegExp[] = [
  // ES module: import ... from "x"; import "x";
  /import\s+(?:[^"';]+?\s+from\s+)?["']([^"']+)["']/g,
  // CommonJS: require("x")
  /require\(\s*["']([^"']+)["']\s*\)/g,
  // dynamic import("x")
  /import\(\s*["']([^"']+)["']\s*\)/g,
  // Python: from x import y / import x
  /^\s*from\s+([\w.]+)\s+import\s+/gm,
  /^\s*import\s+([\w.]+)/gm,
  // Go: import "x"  /  import (\n "x" \n)
  /import\s+["]([^"]+)["]/g,
];

export async function buildDepGraph(files: FileEntry[]): Promise<DepGraph> {
  const fileSet = new Set(files.map((f) => f.relPath));
  const edges = new Map<string, Set<string>>();

  for (const f of files) {
    if (!SRC_EXT.has(f.ext)) continue;
    const deps = new Set<string>();
    let content = "";
    try {
      content = await f.read();
    } catch {
      continue;
    }

    for (const re of IMPORT_REGEXES) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const spec = m[1];
        if (!spec) continue;
        const resolved = resolveSpec(f.relPath, spec, fileSet);
        if (resolved) deps.add(resolved);
      }
    }

    edges.set(f.relPath, deps);
  }

  return { edges };
}

function resolveSpec(
  fromRel: string,
  spec: string,
  fileSet: Set<string>
): string | undefined {
  // skip external packages
  if (
    !spec.startsWith(".") &&
    !spec.startsWith("/") &&
    !spec.includes("/")
  ) {
    return undefined;
  }
  // skip protocol/scoped pkg-like
  if (spec.startsWith("@") || spec.startsWith("node:") || spec.startsWith("http")) {
    return undefined;
  }

  if (spec.startsWith(".") || spec.startsWith("/")) {
    const baseDir = path.posix.dirname(fromRel);
    const joined = spec.startsWith("/")
      ? spec.slice(1)
      : path.posix.normalize(path.posix.join(baseDir, spec));

    const candidates = [
      joined,
      `${joined}.ts`, `${joined}.tsx`, `${joined}.js`, `${joined}.jsx`,
      `${joined}.mjs`, `${joined}.cjs`,
      `${joined}/index.ts`, `${joined}/index.js`,
      `${joined}.py`, `${joined}/__init__.py`,
      `${joined}.go`, `${joined}.rs`,
    ];
    for (const c of candidates) {
      if (fileSet.has(c)) return c;
    }
    return undefined;
  }

  // Python dotted module: convert a.b.c to a/b/c
  const asPath = spec.replace(/\./g, "/");
  for (const c of [`${asPath}.py`, `${asPath}/__init__.py`]) {
    if (fileSet.has(c)) return c;
  }
  return undefined;
}

export function topoSort(graph: DepGraph, allFiles: string[]): string[] {
  const inDeg = new Map<string, number>();
  const reverse = new Map<string, Set<string>>();
  for (const f of allFiles) {
    inDeg.set(f, 0);
    reverse.set(f, new Set());
  }
  for (const [from, deps] of graph.edges) {
    for (const to of deps) {
      if (!inDeg.has(to)) continue;
      inDeg.set(from, (inDeg.get(from) ?? 0) + 1);
      reverse.get(to)!.add(from);
    }
  }

  const queue: string[] = [];
  for (const [f, d] of inDeg) if (d === 0) queue.push(f);
  queue.sort();

  const result: string[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    result.push(cur);
    for (const dependent of reverse.get(cur) ?? []) {
      const nd = (inDeg.get(dependent) ?? 0) - 1;
      inDeg.set(dependent, nd);
      if (nd === 0) queue.push(dependent);
    }
  }
  // append any leftover (cycles) in stable order
  for (const f of allFiles) if (!result.includes(f)) result.push(f);
  return result;
}
