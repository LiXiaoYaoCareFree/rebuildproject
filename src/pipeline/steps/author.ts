import chalk from "chalk";
import cliProgress from "cli-progress";
import type { Step, PlanOutput, AuthorOutput } from "../types.js";
import type { Chapter } from "../../core/planner.js";
import { buildOverview, buildChapter } from "../../core/chapter-builder.js";
import { validateChapter, summarizeIssues } from "../../core/validators.js";
import { mapWithLimit } from "../../utils/concurrency.js";
import { logger } from "../../utils/logger.js";

/**
 * Step 4: ask the AI to write each chapter, then self-critique. If a chapter
 * fails validation (missing sections, missing file blocks, placeholders), feed
 * the issues back and ask the AI to repair, up to `maxRepairs` rounds.
 */
export const authorStep: Step<PlanOutput, AuthorOutput> = {
  name: "Author",
  async run(ctx, input) {
    const { provider, cfg } = ctx;
    const language = cfg.language;
    const maxRepairs = cfg.maxRepairs ?? 1;
    const concurrency = cfg.concurrency ?? 3;

    // Overview first — it doesn't have file-block requirements, just write it.
    const overviewMarkdown = await buildOverview({
      provider,
      language,
      stack: input.stack,
      layered: input.layered,
      plan: input.plan,
    });

    const otherChapters = input.plan.chapters.filter(
      (c) => c.kind !== "overview"
    );

    const bar = new cliProgress.SingleBar(
      {
        format: `  章节 ${chalk.cyan("{bar}")} {percentage}% | {value}/{total} | {status}`,
        barCompleteChar: "█",
        barIncompleteChar: "░",
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    );
    bar.start(otherChapters.length, 0, { status: "" });
    let done = 0;

    logger.dim(
      `  写《00 · 整体浏览》完成（${
        overviewMarkdown.length
      } 字），开始并发写 ${otherChapters.length} 章（concurrency=${concurrency}，瞬时错误自动重试 3 次）`
    );

    const chapters = new Map<string, string>();
    const failedChapters: { id: string; title: string; err: string }[] = [];
    await mapWithLimit(otherChapters, concurrency, async (c) => {
      const tStart = Date.now();
      logger.dim(`  ▶ 开始 ${c.id} · ${c.title}`);
      bar.update(done, { status: c.title });
      try {
        const md = await authorOne(c, ctx, input, maxRepairs);
        chapters.set(c.slug, md);
        done++;
        const secs = ((Date.now() - tStart) / 1000).toFixed(1);
        logger.dim(`  ✓ ${c.id} 完成（${secs}s，${md.length} 字）`);
      } catch (err) {
        // Don't let one chapter take down the whole book. Record it as a
        // placeholder so writer.ts still has something for the slug, and the
        // user can re-run later to fill the gap.
        done++;
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
        const secs = ((Date.now() - tStart) / 1000).toFixed(1);
        logger.dim(`  ✖ ${c.id} 失败（${secs}s）：${msg.slice(0, 200)}`);
      }
      bar.update(done, { status: c.title });
    });
    bar.stop();

    if (failedChapters.length) {
      logger.warn(
        `共有 ${failedChapters.length} 章生成失败，已写入占位 stub：${failedChapters
          .map((f) => f.id)
          .join(", ")}。可重跑 \`rebuildproject generate\` 补齐。`
      );
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
