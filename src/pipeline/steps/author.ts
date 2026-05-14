import path from "node:path";
import chalk from "chalk";
import type { Step, PlanOutput, AuthorOutput } from "../types.js";
import type { Chapter } from "../../core/planner.js";
import { buildOverview, buildChapter } from "../../core/chapter-builder.js";
import { validateChapter, summarizeIssues } from "../../core/validators.js";
import { mapWithLimit } from "../../utils/concurrency.js";
import { logger } from "../../utils/logger.js";
import {
  ensureOutDir,
  writeReadme,
  writeChapterFile,
} from "../../core/writer.js";

/**
 * Step 4: ask the AI to write each chapter, then self-critique. If a chapter
 * fails validation (missing sections, missing file blocks, placeholders), feed
 * the issues back and ask the AI to repair, up to `maxRepairs` rounds.
 *
 * Behavior:
 *  - Writes README + overview as soon as overview is generated, so the
 *    rebuild-guide/ directory becomes visible early.
 *  - Writes each chapter file to disk the moment it's authored — if the run
 *    crashes mid-way, every completed chapter is already on disk.
 *  - Emits one line per chapter event (start / done / fail) with `[N/total]`
 *    counter. No fancy progress bar — concurrent log lines and TTY bars
 *    don't compose (causes redraw glitches / duplicate lines).
 */
export const authorStep: Step<PlanOutput, AuthorOutput> = {
  name: "Author",
  async run(ctx, input) {
    const { provider, cfg } = ctx;
    const language = cfg.language;
    const maxRepairs = cfg.maxRepairs ?? 1;
    const concurrency = cfg.concurrency ?? 3;

    const outDir = await ensureOutDir(ctx.cwd);
    await writeReadme(outDir, input.plan);
    logger.dim(`  目录已就绪：${chalk.cyan(path.relative(ctx.cwd, outDir) || ".")}/`);

    // 1) Overview — write to disk immediately so the run feels alive.
    const tOverview = Date.now();
    logger.dim("  ▶ 开始 00 · 整体浏览与总任务");
    const overviewMarkdown = await buildOverview({
      provider,
      language,
      stack: input.stack,
      layered: input.layered,
      plan: input.plan,
    });
    const overviewChapter = input.plan.chapters.find((c) => c.kind === "overview");
    if (overviewChapter) {
      const p = await writeChapterFile(outDir, overviewChapter, overviewMarkdown);
      logger.dim(
        `  ✓ 00 完成（${((Date.now() - tOverview) / 1000).toFixed(1)}s，${
          overviewMarkdown.length
        } 字）→ ${chalk.cyan(path.relative(ctx.cwd, p))}`
      );
    }

    // 2) Other chapters — concurrent, each writes to disk on completion.
    const otherChapters = input.plan.chapters.filter(
      (c) => c.kind !== "overview"
    );
    const total = otherChapters.length;
    logger.dim(
      `  开始并发写 ${total} 章（concurrency=${concurrency}，瞬时错误自动重试 3 次，单章失败不影响其他章）`
    );

    let done = 0;
    const chapters = new Map<string, string>();
    const failedChapters: { id: string; title: string; err: string }[] = [];

    await mapWithLimit(otherChapters, concurrency, async (c) => {
      const tStart = Date.now();
      logger.dim(`  ▶ 开始 ${c.id} · ${c.title}`);
      try {
        const md = await authorOne(c, ctx, input, maxRepairs);
        chapters.set(c.slug, md);
        const p = await writeChapterFile(outDir, c, md);
        done++;
        const secs = ((Date.now() - tStart) / 1000).toFixed(1);
        logger.dim(
          `  ✓ [${done}/${total}] ${c.id} 完成（${secs}s，${md.length} 字）→ ${chalk.cyan(
            path.relative(ctx.cwd, p)
          )}`
        );
      } catch (err) {
        // Don't let one chapter take down the whole book — write a stub so
        // the user sees the slot and can re-run to fill it.
        const msg = err instanceof Error ? err.message : String(err);
        failedChapters.push({ id: c.id, title: c.title, err: msg });
        const stub = [
          `# ${c.id} · ${c.title}`,
          "",
          "> ⚠️ 本章生成时遇到错误，未能完成。请稍后重新运行 `rebuildproject generate` 重试本章。",
          "",
          "```",
          msg,
          "```",
          "",
        ].join("\n");
        chapters.set(c.slug, stub);
        try {
          await writeChapterFile(outDir, c, stub);
        } catch {
          /* ignore — disk-write failure on the stub itself is not fatal */
        }
        done++;
        const secs = ((Date.now() - tStart) / 1000).toFixed(1);
        logger.dim(
          `  ✖ [${done}/${total}] ${c.id} 失败（${secs}s）：${msg.slice(0, 160)}`
        );
      }
    });

    if (failedChapters.length) {
      logger.warn(
        `共有 ${failedChapters.length} 章生成失败，已写入占位 stub：${failedChapters
          .map((f) => f.id)
          .join(", ")}。可重跑 \`rebuildproject generate\` 补齐。`
      );
    } else {
      logger.dim(`  全部 ${total} 章成功落盘。`);
    }

    return { ...input, chapters, overviewMarkdown };
  },
};

async function authorOne(
  chapter: Chapter,
  ctx: { provider: import("../../providers/index.js").Provider; cfg: import("../../config/store.js").RebuildConfig },
  input: PlanOutput,
  maxRepairs: number
): Promise<string> {
  const { provider, cfg } = ctx;

  let md = await buildChapter({
    provider,
    language: cfg.language,
    stack: input.stack,
    chapter,
  });

  for (let round = 0; round < maxRepairs; round++) {
    const v = validateChapter(md, chapter);
    if (v.ok) return md;

    logger.dim(
      `  ${chapter.id} 自检发现 ${v.issues.length} 个问题，第 ${round + 1} 轮修订…`
    );

    const repairPrompt = [
      `下面是你刚才为《${chapter.id} · ${chapter.title}》产出的稿件，但自检发现以下问题：`,
      "",
      summarizeIssues(v.issues),
      "",
      "请在保留原结构的前提下**针对性修订**——补齐缺失的小节、补全缺失文件的完整代码块、把占位符替换成完整代码。直接输出修订后的完整章节 markdown，不要前言。",
      "",
      "原稿：",
      md,
    ].join("\n");

    const res = await provider.complete({
      messages: [
        { role: "system", content: "你正在迭代修订一份搭建手册章节，只输出修订后的 markdown。" },
        { role: "user", content: repairPrompt },
      ],
      maxTokens: 16000,
      temperature: 0.2,
    });
    md = res.text.trim();
  }

  // accept whatever we have after the final round
  const final = validateChapter(md, chapter);
  if (!final.ok) {
    logger.dim(
      `  ${chapter.id} 仍有 ${final.issues.length} 个未修复问题（已尽力，将照原样写出）`
    );
  }
  return md;
}
