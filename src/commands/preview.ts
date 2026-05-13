import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { logger } from "../utils/logger.js";

interface PreviewOptions {
  port?: string;
  cwd?: string;
}

export function registerPreview(program: Command): void {
  program
    .command("preview")
    .description("本地起静态服务预览生成的手册")
    .option("-p, --port <port>", "端口", "4567")
    .option("-C, --cwd <path>", "项目目录（含 rebuild-guide/）", process.cwd())
    .action(async (opts: PreviewOptions) => {
      await run(opts);
    });
}

async function run(opts: PreviewOptions): Promise<void> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const guideDir = path.join(cwd, "rebuild-guide");
  try {
    await fs.access(guideDir);
  } catch {
    logger.error(`找不到 ${guideDir}。先跑 ${chalk.cyan("rebuildproject generate")}。`);
    process.exitCode = 1;
    return;
  }

  const port = Number(opts.port ?? 4567);
  const server = http.createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
      let rel = url === "/" ? "README.md" : url.replace(/^\//, "");
      if (rel.endsWith("/")) rel += "README.md";
      if (!rel.endsWith(".md")) rel += ".md";

      const target = path.join(guideDir, rel);
      if (!target.startsWith(guideDir)) {
        res.writeHead(403); res.end("forbidden"); return;
      }
      const md = await fs.readFile(target, "utf8");
      const html = renderHtml(rel, md);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        res.writeHead(404); res.end("Not Found");
      } else {
        res.writeHead(500); res.end(String(err));
      }
    }
  });

  server.listen(port, () => {
    logger.success(
      `预览启动：${chalk.cyan(`http://localhost:${port}/`)}（Ctrl+C 退出）`
    );
  });
}

function renderHtml(rel: string, md: string): string {
  const body = mdToHtml(md);
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(rel)} · rebuildproject</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 880px; margin: 2rem auto; padding: 0 1rem; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; line-height: 1.6; }
  pre { background: #0d1117; color: #c9d1d9; padding: 1em; overflow-x: auto; border-radius: 6px; font-size: 0.9em; }
  code { background: rgba(135,131,120,0.15); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
  pre code { background: transparent; padding: 0; }
  h1, h2, h3 { border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
  a { color: #0969da; }
  blockquote { border-left: 4px solid #ddd; margin: 0; padding: 0 1em; color: #666; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 0.4em 0.8em; }
  nav { padding: 0.5em 0; border-bottom: 1px solid #eee; margin-bottom: 1em; }
</style>
</head>
<body>
<nav><a href="/">← 目录</a> · <code>${escapeHtml(rel)}</code></nav>
${body}
</body></html>`;
}

/** 极简 markdown→html，仅覆盖手册需要的常见语法 */
function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];

  const flushCode = () => {
    out.push(
      `<pre><code class="lang-${escapeHtml(codeLang)}">${escapeHtml(
        codeBuf.join("\n")
      )}</code></pre>`
    );
    codeBuf = [];
    codeLang = "";
  };

  for (const ln of lines) {
    if (ln.startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
        codeLang = ln.slice(3).trim();
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(ln);
      continue;
    }
    if (/^#\s+/.test(ln)) { out.push(`<h1>${inline(ln.slice(2))}</h1>`); continue; }
    if (/^##\s+/.test(ln)) { out.push(`<h2>${inline(ln.slice(3))}</h2>`); continue; }
    if (/^###\s+/.test(ln)) { out.push(`<h3>${inline(ln.slice(4))}</h3>`); continue; }
    if (/^[-*]\s+/.test(ln)) { out.push(`<li>${inline(ln.replace(/^[-*]\s+/, ""))}</li>`); continue; }
    if (ln.trim() === "") { out.push(""); continue; }
    out.push(`<p>${inline(ln)}</p>`);
  }
  if (inCode) flushCode();

  return wrapLists(out.join("\n"));
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function wrapLists(html: string): string {
  return html.replace(/(?:<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
