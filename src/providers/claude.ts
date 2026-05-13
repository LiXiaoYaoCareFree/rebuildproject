import Anthropic from "@anthropic-ai/sdk";
import type {
  CompletionRequest,
  CompletionResult,
  Provider,
} from "./types.js";

export interface ClaudeProviderOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
}

export class ClaudeProvider implements Provider {
  readonly name = "claude";
  readonly model: string;
  private client: Anthropic;

  constructor(opts: ClaudeProviderOptions) {
    this.model = opts.model;
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const system = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const messages = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 8000,
      temperature: req.temperature ?? 0.3,
      system: system || undefined,
      messages,
    });

    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    return {
      text,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
    };
  }
}
