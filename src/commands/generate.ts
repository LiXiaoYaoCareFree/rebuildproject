import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "../config/store.js";
import { createProvider } from "../providers/index.js";
import { runPipeline } from "../pipeline/index.js";
import { logger } from "../utils/logger.js";

interface GenerateOptions {
  cwd?: string;
  concurrency?: string;
  repairs?: string;
  provider?: string;
}

export function registerGenerate(program: Command): void {
  program
    .command("generate")
    .alias("g")
    .description("扫描当前目录，用 AI 生成搭建手册到 ./rebuild-guide/")
    .option("-C, --cwd <path>", "目标项目目录", process.cwd())
    .option("-c, --concurrency <n>", "章节并发数")
    .option("-r, --repairs <n>", "每章最大自动修订轮数")
    .option(
      "-p, --provider <name>",
      "覆盖配置里的 provider（claude-code / claude / openai-compatible）"
    )
    .action(async (opts: GenerateOptions) => {
      const cwd = path.resolve(opts.cwd ?? process.cwd());
      const cfg = await loadConfig();
      if (opts.provider) cfg.provider = opts.provider as typeof cfg.provider;
      if (opts.concurrency) cfg.concurrency = Number(opts.concurrency);
      if (opts.repairs) cfg.maxRepairs = Number(opts.repairs);

      const provider = createProvider(cfg);
      const modelLabel =
        cfg.provider === "claude-code"
          ? cfg.claudeCode?.model ?? "default"
          : cfg.provider === "claude"
          ? cfg.claude?.model ?? "?"
          : cfg.openai?.model ?? "?";

      logger.info(`目标目录：${chalk.cyan(cwd)}`);
      logger.info(
        `Provider：${chalk.cyan(cfg.provider)} · 模型：${chalk.cyan(
          modelLabel
        )} · 语言：${chalk.cyan(cfg.language)}`
      );

      await runPipeline({ cwd, cfg, provider });

      logger.success("手册生成完成 → ./rebuild-guide/");
      logger.info(
        `下一步：${chalk.cyan("rebuildproject preview")} 浏览 / ${chalk.cyan(
          "rebuildproject verify"
        )} 自检`
      );
    });
}
