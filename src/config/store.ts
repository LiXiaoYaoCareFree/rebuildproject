import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";

export type ProviderName = "claude-code" | "claude" | "openai-compatible";
export type Language = "zh" | "en";

export interface RebuildConfig {
  provider: ProviderName;
  language: Language;
  claudeCode?: {
    binary?: string;
    model?: string;
  };
  claude?: {
    apiKey?: string;
    model?: string;
    baseURL?: string;
  };
  openai?: {
    apiKey?: string;
    model?: string;
    baseURL?: string;
  };
  concurrency?: number;
  /** how many critique → repair rounds per chapter */
  maxRepairs?: number;
}

const DEFAULT_CONFIG: RebuildConfig = {
  provider: "claude-code",
  language: "zh",
  claudeCode: {
    binary: "claude",
    model: "default",
  },
  claude: {
    model: "claude-sonnet-4-6",
    baseURL: "https://api.anthropic.com",
  },
  openai: {
    model: "gpt-4o-mini",
    baseURL: "https://api.openai.com/v1",
  },
  concurrency: 3,
  maxRepairs: 1,
};

const CONFIG_DIR = path.join(os.homedir(), ".rebuildproject");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.yaml");

export async function loadConfig(): Promise<RebuildConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf8");
    const parsed = YAML.parse(raw) as Partial<RebuildConfig> | null;
    return mergeConfig(DEFAULT_CONFIG, parsed ?? {});
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...DEFAULT_CONFIG };
    }
    throw err;
  }
}

export async function saveConfig(cfg: RebuildConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, YAML.stringify(cfg), "utf8");
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

function mergeConfig(
  base: RebuildConfig,
  override: Partial<RebuildConfig>
): RebuildConfig {
  return {
    ...base,
    ...override,
    claudeCode: { ...base.claudeCode, ...override.claudeCode },
    claude: { ...base.claude, ...override.claude },
    openai: { ...base.openai, ...override.openai },
  };
}

export function resolveApiKey(
  cfg: RebuildConfig,
  provider: ProviderName
): string | undefined {
  if (provider === "claude") {
    return cfg.claude?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  }
  if (provider === "openai-compatible") {
    return cfg.openai?.apiKey ?? process.env.OPENAI_API_KEY;
  }
  // claude-code uses local CLI auth — no API key
  return undefined;
}
