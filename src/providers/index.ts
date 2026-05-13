import { ClaudeProvider } from "./claude.js";
import { ClaudeCodeProvider } from "./claude-code.js";
import { OpenAIProvider } from "./openai.js";
import type { Provider } from "./types.js";
import {
  loadConfig,
  resolveApiKey,
  type RebuildConfig,
  type ProviderName,
} from "../config/store.js";

export type { Provider } from "./types.js";

export function createProvider(cfg: RebuildConfig): Provider {
  if (cfg.provider === "claude-code") {
    return new ClaudeCodeProvider({
      binary: cfg.claudeCode?.binary,
      model: cfg.claudeCode?.model,
    });
  }

  if (cfg.provider === "claude") {
    const apiKey = resolveApiKey(cfg, "claude");
    if (!apiKey) throw missingKey("claude", "ANTHROPIC_API_KEY");
    return new ClaudeProvider({
      apiKey,
      model: cfg.claude?.model ?? "claude-sonnet-4-6",
      baseURL: cfg.claude?.baseURL,
    });
  }

  const apiKey = resolveApiKey(cfg, "openai-compatible");
  if (!apiKey) throw missingKey("openai-compatible", "OPENAI_API_KEY");
  return new OpenAIProvider({
    apiKey,
    model: cfg.openai?.model ?? "gpt-4o-mini",
    baseURL: cfg.openai?.baseURL,
  });
}

function missingKey(provider: ProviderName, env: string): Error {
  return new Error(
    `${provider} 缺少 API key。运行 \`rebuildproject config\` 或设置环境变量 ${env}。`
  );
}

export async function createProviderFromEnv(): Promise<Provider> {
  const cfg = await loadConfig();
  return createProvider(cfg);
}
