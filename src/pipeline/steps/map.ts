import type { Step, DiscoverOutput, MapOutput } from "../types.js";
import { buildDepGraph } from "../../core/dep-graph.js";

/** Step 2: build a shallow file-level dependency graph from imports. */
export const mapStep: Step<DiscoverOutput, MapOutput> = {
  name: "Map",
  async run(_ctx, input) {
    const graph = await buildDepGraph(input.files);
    return { ...input, graph };
  },
};
