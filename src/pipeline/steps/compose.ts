import type { Step, AuthorOutput, ComposeOutput } from "../types.js";
import { writeGuide } from "../../core/writer.js";

/** Step 5: write all chapters and the index README to ./rebuild-guide/ . */
export const composeStep: Step<AuthorOutput, ComposeOutput> = {
  name: "Compose",
  async run(ctx, input) {
    const outDir = await writeGuide({
      cwd: ctx.cwd,
      plan: input.plan,
      overviewMarkdown: input.overviewMarkdown,
      chapterMarkdowns: input.chapters,
    });
    return { outDir };
  },
};
