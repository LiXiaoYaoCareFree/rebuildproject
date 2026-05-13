import { promises as fs } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import ignore from "ignore";

export interface FileEntry {
  /** path relative to repo root, posix style */
  relPath: string;
  /** absolute path */
  absPath: string;
  ext: string;
  sizeBytes: number;
  read(): Promise<string>;
}

const DEFAULT_IGNORES = [
  "node_modules/**",
  "dist/**",
  "build/**",
  "out/**",
  ".next/**",
  ".turbo/**",
  ".cache/**",
  ".git/**",
  ".idea/**",
  ".vscode/**",
  "coverage/**",
  "**/*.lock",
  "**/*.log",
  "**/.DS_Store",
  "rebuild-guide/**",
];

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
  ".pdf", ".zip", ".tar", ".gz", ".7z",
  ".mp3", ".mp4", ".mov", ".wav",
  ".woff", ".woff2", ".ttf", ".eot",
  ".node", ".wasm", ".bin",
]);

const MAX_FILE_BYTES = 200 * 1024;

export interface ScanOptions {
  cwd: string;
  maxFiles?: number;
}

export async function scan(opts: ScanOptions): Promise<FileEntry[]> {
  const cwd = path.resolve(opts.cwd);
  const ig = ignore().add(DEFAULT_IGNORES);

  const gitignorePath = path.join(cwd, ".gitignore");
  try {
    const txt = await fs.readFile(gitignorePath, "utf8");
    ig.add(txt);
  } catch {
    /* no .gitignore */
  }

  const all = await fg(["**/*"], {
    cwd,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    suppressErrors: true,
  });

  const filtered = all.filter((p) => !ig.ignores(p));
  const limit = opts.maxFiles ?? 2000;
  const slice = filtered.slice(0, limit);

  const entries: FileEntry[] = [];
  for (const rel of slice) {
    const ext = path.extname(rel).toLowerCase();
    if (BINARY_EXT.has(ext)) continue;
    const abs = path.join(cwd, rel);
    const stat = await fs.stat(abs);
    if (stat.size > MAX_FILE_BYTES) continue;
    entries.push({
      relPath: rel.split(path.sep).join("/"),
      absPath: abs,
      ext,
      sizeBytes: stat.size,
      read: () => fs.readFile(abs, "utf8"),
    });
  }
  return entries;
}
