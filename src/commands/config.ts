import { Command } from "commander";
import { input, select, password } from "@inquirer/prompts";
import chalk from "chalk";
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  type ProviderName,
  type Language,
  type RebuildConfig,
} from "../config/store.js";
import { ClaudeCodeProvider } from "../providers/claude-code.js";
import { logger } from "../utils/logger.js";

export function registerConfig(program: Command): void {
  program
    .command("config")
    .description("交互式配置 AI provider / API key / 输出语言")
    .option("--show", "只显示当前配置")
    .action(async (opts: { show?: boolean }) => {
      const cfg = await loadConfig();
      if (opts.show) {
        printConfig(cfg);
        return;
      }

      const hasClaudeCli = await ClaudeCodeProvider.detect();
      const choices: { name: string; value: ProviderName; disabled?: string }[] = [
        {
          name:
            "Claude Code（本地 claude CLI，无需 API key）" +
            (hasClaudeCli ? "" : " — 未检测到 claude，先装 Claude Code"),
          value: "claude-code",
          ...(hasClaudeCli ? {} : { disabled: "未安装 claude CLI" }),
        },
        { name: "Claude API（Anthropic SDK）", value: "claude" },
        {
          name: "OpenAI 兼容（含 DeepSeek / Kimi / 智谱 等）",
          value: "openai-compatible",
        },
      ];

      const provider = (await select({
        message: "选择 AI provider",
        choices,
        default: cfg.provider,
      })) as ProviderName;

      const next: RebuildConfig = { ...cfg, provider };

      if (provider === "claude-code") {
        const binary = await input({
          message: "claude 可执行文件",
          default: cfg.claudeCode?.binary ?? "claude",
        });
        const model = await input({
          message: "模型名（default 走 claude CLI 默认值）",
          default: cfg.claudeCode?.model ?? "default",
        });
        next.claudeCode = { ...cfg.claudeCode, binary, model };
      } else if (provider === "claude") {
        const apiKey = await password({
          message: "Anthropic API Key",
          mask: "*",
        });
        const model = await input({
          message: "模型名",
          default: cfg.claude?.model ?? "claude-sonnet-4-6",
        });
        const baseURL = await input({
          message: "API Base URL",
          default: cfg.claude?.baseURL ?? "https://api.anthropic.com",
        });
        next.claude = { ...cfg.claude, apiKey, model, baseURL };
      } else {
        const apiKey = await password({
          message: "OpenAI 兼容端点的 API Key",
          mask: "*",
        });
        const model = await input({
          message: "模型名",
          default: cfg.openai?.model ?? "gpt-4o-mini",
        });
        const baseURL = await input({
          message: "API Base URL",
          default: cfg.openai?.baseURL ?? "https://api.openai.com/v1",
        });
        next.openai = { ...cfg.openai, apiKey, model, baseURL };
      }

      next.language = (await select({
        message: "手册输出语言",
        choices: [
          { name: "中文", value: "zh" as Language },
          { name: "English", value: "en" as Language },
        ],
        default: cfg.language,
      })) as Language;

      await saveConfig(next);
      logger.success(`已保存到 ${chalk.cyan(getConfigPath())}`);
    });
}

function printConfig(cfg: RebuildConfig): void {
  logger.info(`配置文件：${chalk.cyan(getConfigPath())}`);
  console.log(chalk.bold("\n当前配置："));
  console.log(`  provider:    ${cfg.provider}`);
  console.log(`  language:    ${cfg.language}`);
  console.log(`  concurrency: ${cfg.concurrency ?? 3}`);
  console.log(`  maxRepairs:  ${cfg.maxRepairs ?? 1}`);
  if (cfg.provider === "claude-code") {
    console.log(`  claudeCode.binary: ${cfg.claudeCode?.binary}`);
    console.log(`  claudeCode.model:  ${cfg.claudeCode?.model}`);
  } else if (cfg.provider === "claude") {
    console.log(`  claude.model:    ${cfg.claude?.model}`);
    console.log(`  claude.baseURL:  ${cfg.claude?.baseURL}`);
    console.log(
      `  claude.apiKey:   ${
        cfg.claude?.apiKey ? "***已设置***" : chalk.yellow("未设置")
      }`
    );
  } else {
    console.log(`  openai.model:    ${cfg.openai?.model}`);
    console.log(`  openai.baseURL:  ${cfg.openai?.baseURL}`);
    console.log(
      `  openai.apiKey:   ${
        cfg.openai?.apiKey ? "***已设置***" : chalk.yellow("未设置")
      }`
    );
  }
}
