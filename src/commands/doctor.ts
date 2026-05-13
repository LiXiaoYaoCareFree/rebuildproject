import { Command } from "commander";
import chalk from "chalk";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, getConfigPath } from "../config/store.js";
import { ClaudeCodeProvider } from "../providers/claude-code.js";
import { which } from "../utils/exec.js";
import { logger } from "../utils/logger.js";

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("检查环境是否就绪：claude CLI / API key / 写权限 / Node 版本")
    .action(async () => {
      const checks: { name: string; ok: boolean; hint?: string }[] = [];

      checks.push({
        name: `Node 版本 ≥ 20`,
        ok: parseInt(process.versions.node.split(".")[0] ?? "0", 10) >= 20,
        hint: `当前 ${process.versions.node}`,
      });

      const hasClaude = await ClaudeCodeProvider.detect();
      checks.push({
        name: "claude CLI 可用",
        ok: hasClaude,
        hint: hasClaude
          ? "可用 provider=claude-code，无需 API key"
          : "未找到 `claude`。装 Claude Code 或改用 claude/openai-compatible provider",
      });

      const cfg = await loadConfig();
      const apiKeyOk = (() => {
        if (cfg.provider === "claude-code") return true;
        if (cfg.provider === "claude")
          return !!(cfg.claude?.apiKey || process.env.ANTHROPIC_API_KEY);
        return !!(cfg.openai?.apiKey || process.env.OPENAI_API_KEY);
      })();
      checks.push({
        name: `当前 provider = ${cfg.provider} 的凭据`,
        ok: apiKeyOk,
        hint: apiKeyOk
          ? "已就绪"
          : "跑 `rebuildproject config` 配置 API key",
      });

      const writable = await canWrite(process.cwd());
      checks.push({
        name: `当前目录可写：${process.cwd()}`,
        ok: writable,
        hint: writable ? "可写" : "rebuild-guide/ 将无法落盘",
      });

      const homeWritable = await canWrite(os.homedir());
      checks.push({
        name: `配置目录：${path.dirname(getConfigPath())}`,
        ok: homeWritable,
        hint: homeWritable ? "可写" : "无法保存配置",
      });

      const whichClaude = await whichPath("claude");
      if (whichClaude)
        logger.dim(`  claude 路径：${whichClaude}`);

      console.log();
      let allOk = true;
      for (const c of checks) {
        const tag = c.ok ? chalk.green("✔") : chalk.red("✖");
        console.log(`${tag} ${c.name}`);
        if (c.hint) console.log(`    ${chalk.gray(c.hint)}`);
        if (!c.ok) allOk = false;
      }
      console.log();
      if (allOk) logger.success("环境就绪。可直接 `rebuildproject generate`。");
      else {
        logger.warn("有检查未通过——按上面 hint 修复后重跑 doctor。");
        process.exitCode = 1;
      }
    });
}

async function canWrite(p: string): Promise<boolean> {
  try {
    await fs.access(p, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function whichPath(cmd: string): Promise<string | undefined> {
  if (!(await which(cmd))) return undefined;
  try {
    const { exec } = await import("../utils/exec.js");
    const out = await exec(process.platform === "win32" ? "where" : "which", [cmd]);
    return out.stdout.trim().split("\n")[0];
  } catch {
    return undefined;
  }
}
