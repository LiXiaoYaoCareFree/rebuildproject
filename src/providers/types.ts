export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface Provider {
  readonly name: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
