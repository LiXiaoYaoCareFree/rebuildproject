import type { Provider } from "../providers/index.js";
import type { RebuildConfig } from "../config/store.js";
import type { FileEntry } from "../core/scanner.js";
import type { Stack } from "../core/stack-detector.js";
import type { DepGraph } from "../core/dep-graph.js";
import type { Layered } from "../core/layerer.js";
import type { Plan } from "../core/planner.js";

/** Shared, read-only context threaded through every pipeline step. */
export interface Context {
  cwd: string;
  cfg: RebuildConfig;
  provider: Provider;
}

/**
 * A pipeline step is a pure function from a typed input to a typed output,
 * given a Context. Steps are composed sequentially in pipeline/index.ts.
 */
export interface Step<I, O> {
  name: string;
  run(ctx: Context, input: I): Promise<O>;
}

/* === Outputs of the built-in steps, kept in one place for readability === */

export interface DiscoverOutput {
  files: FileEntry[];
  stack: Stack;
}

export interface MapOutput extends DiscoverOutput {
  graph: DepGraph;
}

export interface PlanOutput extends MapOutput {
  layered: Layered;
  plan: Plan;
}

export interface AuthorOutput extends PlanOutput {
  /** chapter slug → markdown */
  chapters: Map<string, string>;
  overviewMarkdown: string;
}

export interface ComposeOutput {
  outDir: string;
}
