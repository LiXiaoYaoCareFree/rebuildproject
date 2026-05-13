import type { Step, DiscoverOutput } from "../types.js";
import { scan } from "../../core/scanner.js";
import { detectStack } from "../../core/stack-detector.js";

/** Step 1: enumerate files and identify the project's tech stack. */
export const discoverStep: Step<undefined, DiscoverOutput> = {
  name: "Discover",
  async run(ctx) {
    const files = await scan({ cwd: ctx.cwd });
    if (files.length === 0) {
      throw new Error(`目录里没扫到文件：${ctx.cwd}`);
    }
    const stack = await detectStack(files);
    return { files, stack };
  },
};
