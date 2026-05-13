import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Command } from "commander";
import chalk from "chalk";
import { logger } from "../utils/logger.js";

interface VerifyOptions {
  cwd?: string;
  out?: string;
}

export function registerVerify(program: Command): void {
  program
    .command("verify")
    .description("把手册里的代码块复原到临时目录，并与原项目逐文件对比")
    .option("-C, --cwd <path>", "项目目录（含 rebuild-guide/）", process.cwd())
    .option("-o, --out <path>", "复原输出目录（默认临时目录）")
    .action(async (opts: VerifyOptions) => {
      await run(opts);
    });
}

async function run(opts: VerifyOptions): Promise<void> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const guideDir = path.join(cwd, "rebuild-guide");
  try {
    await fs.access(guideDir);
  } catch {
    logger.error(`找不到 ${guideDir}。先跑 ${chalk.cyan("rebuildproject generate")}。`);
    process.exitCode = 1;
    return;
  }
  const outDir =
    opts.out ?? (await fs.mkdtemp(path.join(os.tmpdir(), "rebuildproject-")));

  const blocks = await collectCodeBlocks(guideDir);
  logger.info(`从手册中提取到 ${chalk.cyan(blocks.size)} 个文件代码块`);

  for (const [rel, content] of blocks) {
    const target = path.join(outDir, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }
  logger.success(`复原完成：${chalk.cyan(outDir)}`);

  // diff
  let identical = 0;
  let differ = 0;
  let missing = 0;
  for (const [rel, content] of blocks) {
    const orig = path.join(cwd, rel);
    try {
      const origContent = await fs.readFile(orig, "utf8");
      if (origContent === content) identical++;
      else {
        differ++;
        logger.warn(`差异：${rel}`);
      }
    } catch {
      missing++;
      logger.warn(`原项目缺该文件：${rel}`);
    }
  }

  console.log();
  console.log(
    `结果：一致 ${chalk.green(identical)} · 不一致 ${chalk.yellow(differ)} · 缺失 ${chalk.red(missing)}`
  );
  if (differ > 0 || missing > 0) {
    logger.info(`比对临时目录：${chalk.cyan(outDir)}`);
    process.exitCode = 1;
  }
}

const FENCE = /^```([\w+-]*?)(?::([^\s`]+))?\s*$/;

async function collectCodeBlocks(
  guideDir: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const entries = await listMd(guideDir);
  for (const file of entries) {
    const md = await fs.readFile(file, "utf8");
    const lines = md.split("\n");
    let i = 0;
    while (i < lines.length) {
      const ln = lines[i] ?? "";
      const m = ln.match(FENCE);
      if (!m) { i++; continue; }
      const filePath = m[2];
      if (!filePath) {
        // skip non-tagged blocks
        i++;
        while (i < lines.length && !(lines[i] ?? "").startsWith("```")) i++;
        i++; // skip closing fence
        continue;
      }
      i++;
      const buf: string[] = [];
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++; // skip closing fence
      out.set(normalize(filePath), buf.join("\n"));
    }
  }
  return out;
}

async function listMd(dir: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    const items = await fs.readdir(d, { withFileTypes: true });
    for (const it of items) {
      const p = path.join(d, it.name);
      if (it.isDirectory()) stack.push(p);
      else if (it.isFile() && it.name.endsWith(".md")) out.push(p);
    }
  }
  return out;
}

function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.?\//, "");
}
