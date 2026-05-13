import type { Step, MapOutput, PlanOutput } from "../types.js";
import { layer } from "../../core/layerer.js";
import { planChapters } from "../../core/planner.js";

/** Step 3: bucket files into L1-L6 layers and produce a chapter outline. */
export const planStep: Step<MapOutput, PlanOutput> = {
  name: "Plan",
  async run(_ctx, input) {
    const layered = layer(input.files, input.stack, input.graph);
    const plan = planChapters(layered, input.stack);
    return { ...input, layered, plan };
  },
};
