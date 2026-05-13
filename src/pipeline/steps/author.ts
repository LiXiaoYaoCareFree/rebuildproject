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

    const chapters = new Map<string, string>();
    await mapWithLimit(otherChapters, concurrency, async (c) => {
      bar.update(done, { status: c.title });
      const md = await authorOne(c, ctx, input, maxRepairs);
      chapters.set(c.slug, md);
      done++;
      bar.update(done, { status: c.title });
    });
    bar.stop();

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
