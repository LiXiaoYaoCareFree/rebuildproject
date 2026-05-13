import type { FileEntry } from "./scanner.js";

export interface Stack {
  language: string;
  runtime?: string;
  packageManager?: string;
  buildTool?: string;
  frameworks: string[];
  testFrameworks: string[];
  entryPoints: string[];
  hasDocker: boolean;
  hasCI: boolean;
}

interface PackageJson {
  main?: string;
  type?: string;
  bin?: Record<string, string> | string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
}

const FRAMEWORK_MARKERS: Record<string, string[]> = {
  Next: ["next"],
  React: ["react"],
  Vue: ["vue"],
  Svelte: ["svelte"],
  Express: ["express"],
  Fastify: ["fastify"],
  Koa: ["koa"],
  NestJS: ["@nestjs/core"],
  Hono: ["hono"],
  FastAPI: ["fastapi"],
  Flask: ["flask"],
  Django: ["django"],
  Gin: ["gin-gonic/gin"],
};

const TEST_MARKERS: Record<string, string[]> = {
  Vitest: ["vitest"],
  Jest: ["jest"],
  Mocha: ["mocha"],
  Playwright: ["@playwright/test"],
  Pytest: ["pytest"],
};

export async function detectStack(files: FileEntry[]): Promise<Stack> {
  const byPath = new Map(files.map((f) => [f.relPath, f]));
  const stack: Stack = {
    language: "unknown",
    frameworks: [],
    testFrameworks: [],
    entryPoints: [],
    hasDocker: false,
    hasCI: false,
  };

  if (byPath.has("package.json")) {
    const pkgRaw = await byPath.get("package.json")!.read();
    const pkg = safeJson<PackageJson>(pkgRaw);
    stack.language = hasTsConfig(byPath) ? "TypeScript" : "JavaScript";
    stack.runtime = "Node.js";
    stack.packageManager = pkg?.packageManager?.split("@")[0] ??
      (byPath.has("pnpm-lock.yaml") ? "pnpm" :
       byPath.has("yarn.lock") ? "yarn" :
       byPath.has("bun.lockb") ? "bun" : "npm");
    stack.buildTool = guessBuildTool(byPath, pkg);
    stack.frameworks = matchMarkers(pkg, FRAMEWORK_MARKERS);
    stack.testFrameworks = matchMarkers(pkg, TEST_MARKERS);
    if (pkg?.main) stack.entryPoints.push(pkg.main);
    if (typeof pkg?.bin === "string") stack.entryPoints.push(pkg.bin);
    else if (pkg?.bin) stack.entryPoints.push(...Object.values(pkg.bin));
  } else if (byPath.has("pyproject.toml") || byPath.has("requirements.txt")) {
    stack.language = "Python";
    stack.runtime = "Python";
    stack.packageManager = byPath.has("poetry.lock") ? "poetry" :
      byPath.has("uv.lock") ? "uv" : "pip";
    const reqs = (await readIfExists(byPath, "requirements.txt")) +
      (await readIfExists(byPath, "pyproject.toml"));
    stack.frameworks = matchTextMarkers(reqs, FRAMEWORK_MARKERS);
    stack.testFrameworks = matchTextMarkers(reqs, TEST_MARKERS);
    for (const candidate of ["main.py", "app.py", "src/main.py"]) {
      if (byPath.has(candidate)) stack.entryPoints.push(candidate);
    }
  } else if (byPath.has("go.mod")) {
    stack.language = "Go";
    stack.runtime = "Go";
    stack.packageManager = "go modules";
    const mod = await byPath.get("go.mod")!.read();
    stack.frameworks = matchTextMarkers(mod, FRAMEWORK_MARKERS);
    if (byPath.has("main.go")) stack.entryPoints.push("main.go");
  } else if (byPath.has("Cargo.toml")) {
    stack.language = "Rust";
    stack.runtime = "Rust";
    stack.packageManager = "cargo";
    if (byPath.has("src/main.rs")) stack.entryPoints.push("src/main.rs");
    if (byPath.has("src/lib.rs")) stack.entryPoints.push("src/lib.rs");
  }

  stack.hasDocker = byPath.has("Dockerfile") || byPath.has("docker-compose.yml");
  stack.hasCI = [...byPath.keys()].some(
    (p) => p.startsWith(".github/workflows/") || p.startsWith(".gitlab-ci")
  );

  return stack;
}

function safeJson<T>(s: string): T | undefined {
  try {
    return JSON.parse(s) as T;
  } catch {
    return undefined;
  }
}

function hasTsConfig(byPath: Map<string, FileEntry>): boolean {
  return [...byPath.keys()].some((p) => p === "tsconfig.json" || p.endsWith(".ts"));
}

function guessBuildTool(
  byPath: Map<string, FileEntry>,
  pkg: PackageJson | undefined
): string | undefined {
  const has = (n: string) => byPath.has(n);
  if (has("vite.config.ts") || has("vite.config.js")) return "Vite";
  if (has("webpack.config.js") || has("webpack.config.ts")) return "Webpack";
  if (has("rollup.config.js") || has("rollup.config.ts")) return "Rollup";
  if (has("tsup.config.ts")) return "tsup";
  if (has("esbuild.config.js")) return "esbuild";
  if (pkg?.scripts?.["build"]?.includes("tsc")) return "tsc";
  return undefined;
}

function matchMarkers(
  pkg: PackageJson | undefined,
  markers: Record<string, string[]>
): string[] {
  if (!pkg) return [];
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const out: string[] = [];
  for (const [name, keys] of Object.entries(markers)) {
    if (keys.some((k) => deps[k])) out.push(name);
  }
  return out;
}

function matchTextMarkers(
  text: string,
  markers: Record<string, string[]>
): string[] {
  const out: string[] = [];
  for (const [name, keys] of Object.entries(markers)) {
    if (keys.some((k) => text.includes(k))) out.push(name);
  }
  return out;
}

async function readIfExists(
  byPath: Map<string, FileEntry>,
  rel: string
): Promise<string> {
  const f = byPath.get(rel);
  return f ? await f.read() : "";
}
