import OpenAI from "openai";
import type {
  CompletionRequest,
  CompletionResult,
  Provider,
} from "./types.js";

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
}

export class OpenAIProvider implements Provider {
  readonly name = "openai-compatible";
  readonly model: string;
  private client: OpenAI;

  constructor(opts: OpenAIProviderOptions) {
    this.model = opts.model;
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 8000,
      temperature: req.temperature ?? 0.3,
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text = res.choices[0]?.message?.content ?? "";
    return {
      text,
      usage: res.usage
        ? {
            inputTokens: res.usage.prompt_tokens,
            outputTokens: res.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
