import type { Step, MapOutput, PlanOutput } from "../types.js";
import { layer } from "../../core/layerer.js";
import { planChapters } from "../../core/planner.js";
import { buildOutline } from "../../core/outliner.js";
import { logger } from "../../utils/logger.js";

/**
 * Step 3: layer the files, then design the chapter outline.
 *
 * The outline is produced by the LLM (see core/outliner.ts) so the book's
 * structure tracks the project's real cognitive shape — including chapters
 * that pure pattern-matching could never invent. The deterministic
 * `planChapters` is kept as a safety net for offline runs or when the LLM
 * returns something we can't parse.
 */
export const planStep: Step<MapOutput, PlanOutput> = {
  name: "Plan",
  async run(ctx, input) {
    const layered = layer(input.files, input.stack, input.graph);

    // 1) Ask the LLM to design the table of contents.
    const llmChapters = await buildOutline({
      provider: ctx.provider,
      stack: input.stack,
      layered,
    });

    let chapters = llmChapters;
    if (!chapters) {
      logger.dim("  目录回退：使用内置 planner 生成细颗粒大纲");
      chapters = planChapters(layered, input.stack).chapters;
    } else {
      logger.dim(`  目录设计完成：${chapters.length} 章（LLM 设计）`);
    }

    const plan = { stack: input.stack, chapters };
    return { ...input, layered, plan };
  },
};
