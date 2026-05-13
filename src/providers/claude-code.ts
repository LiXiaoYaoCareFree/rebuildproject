import { exec, which } from "../utils/exec.js";
import type {
  CompletionRequest,
  CompletionResult,
  Provider,
} from "./types.js";

export interface ClaudeCodeProviderOptions {
  /** model id passed to `claude --model`, optional */
  model?: string;
  /** override the binary name; defaults to "claude" */
  binary?: string;
  /** per-call timeout in ms */
  timeoutMs?: number;
}

/**
 * Uses the local Claude Code CLI (`claude -p`) as the LLM backend. No API
 * key needed — relies on the user's existing Claude Code authentication.
 */
export class ClaudeCodeProvider implements Provider {
  readonly name = "claude-code";
  readonly model: string;
  private readonly binary: string;
  private readonly timeoutMs: number;

  constructor(opts: ClaudeCodeProviderOptions = {}) {
    this.model = opts.model ?? "default";
    this.binary = opts.binary ?? "claude";
    this.timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  }

  static async detect(binary = "claude"): Promise<boolean> {
    return which(binary);
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const system = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const userText = req.messages
      .filter((m) => m.role !== "system")
      .map((m) =>
        m.role === "user" ? m.content : `<assistant>\n${m.content}\n</assistant>`
      )
      .join("\n\n");

    const args: string[] = ["-p", "--output-format", "text"];
    if (this.model && this.model !== "default") {
      args.push("--model", this.model);
    }
    if (system) {
      args.push("--append-system-prompt", system);
    }
    // Disable filesystem-modifying tools — we want pure text generation.
    args.push("--disallowedTools", "Edit,Write,NotebookEdit");

    const res = await exec(this.binary, args, {
      stdin: userText,
      timeoutMs: this.timeoutMs,
    });

    return { text: res.stdout.trim() };
  }
}
