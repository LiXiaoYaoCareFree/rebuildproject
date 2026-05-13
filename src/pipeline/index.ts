import ora from "ora";
import chalk from "chalk";
import type { Context, Step } from "./types.js";
import { discoverStep } from "./steps/discover.js";
import { mapStep } from "./steps/map.js";
import { planStep } from "./steps/plan.js";
import { authorStep } from "./steps/author.js";
import { composeStep } from "./steps/compose.js";

export * from "./types.js";

/**
 * The full rebuildproject generation pipeline:
 *
 *   Discover → Map → Plan → Author (with self-critique) → Compose
 *
 * Each step is a small, named, typed unit; they compose left-to-right in
 * `runPipeline`. Adding a new step = drop it in `steps/`, append below.
 */
export const PIPELINE = [
  discoverStep,
  mapStep,
  planStep,
  authorStep,
  composeStep,
] as const;

export async function runPipeline(ctx: Context): Promise<void> {
  let cursor: unknown = undefined;
  for (const step of PIPELINE) {
    const sp = ora(`${chalk.magenta(step.name)} …`).start();
    const t0 = Date.now();
    try {
      cursor = await (step as Step<unknown, unknown>).run(ctx, cursor);
      sp.succeed(`${chalk.magenta(step.name)} ${chalk.gray(`${Date.now() - t0}ms`)}`);
    } catch (err) {
      sp.fail(`${chalk.magenta(step.name)} 失败`);
      throw err;
    }
  }
}
