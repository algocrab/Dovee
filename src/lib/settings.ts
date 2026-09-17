import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getProvider, type ProviderId } from "./providers";
import type { ThemeId } from "./theme";

export type ReasoningEffort = "none" | "low" | "high" | "max";

export type DoveeSettings = {
  apiKey: string;
  apiKeys: Record<string, string>;
  provider: ProviderId;
  model: string;
  reasoningEffort: ReasoningEffort;
  workspace: string;
  baseUrl: string;
  theme: ThemeId;
  editorFontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  autoSave: boolean;
};

const SETTINGS_DIR = path.join(os.homedir(), ".dovee");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");

const ENV_KEYS: Record<string, string[]> = {
  deepseek: ["DEEPSEEK_API_KEY", "DEEPSEEK_KEY"],
  openai: ["OPENAI_API_KEY"],
  xai: ["XAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  groq: ["GROQ_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  together: ["TOGETHER_API_KEY"],
  custom: ["LLM_API_KEY"],
};

const DEFAULTS: DoveeSettings = {
  apiKey: "",
  apiKeys: {},
  provider: "deepseek",
  model: "deepseek-flash",
  reasoningEffort: "high",
  workspace: process.cwd(),
  baseUrl: "https://api.deepseek.com",
  theme: "dark",
  editorFontSize: 15,
  wordWrap: true,
  minimap: false,
  autoSave: false,
};

function envKey(provider: string) {
  for (const name of ENV_KEYS[provider] ?? []) {
    const v = process.env[name];
    if (v) return v;
  }
  return "";
}

function asProvider(value: unknown): ProviderId {
  const ids = [
    "deepseek",
    "openai",
    "xai",
    "anthropic",
    "google",
    "groq",
    "openrouter",
    "mistral",
    "together",
    "custom",
  ] as const;
  return ids.includes(value as ProviderId) ? (value as ProviderId) : "deepseek";
}

export async function loadSettings(): Promise<DoveeSettings> {
  let stored: Partial<DoveeSettings> = {};
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    stored = JSON.parse(raw) as Partial<DoveeSettings>;
  } catch {
    stored = {};
  }

  const provider = asProvider(stored.provider);
  const preset = getProvider(provider);
  const apiKeys = stored.apiKeys ?? {};
  const apiKey = apiKeys[provider] || stored.apiKey || envKey(provider);

  return {
    ...DEFAULTS,
    ...stored,
    provider,
    apiKeys,
    apiKey,
    model: stored.model || preset.models[0] || DEFAULTS.model,
    baseUrl: stored.baseUrl || preset.baseUrl || DEFAULTS.baseUrl,
    workspace: stored.workspace || process.cwd(),
    theme: stored.theme === "light" || stored.theme === "dusk" || stored.theme === "dark" ? stored.theme : DEFAULTS.theme,
    editorFontSize: typeof stored.editorFontSize === "number" ? stored.editorFontSize : DEFAULTS.editorFontSize,
    wordWrap: typeof stored.wordWrap === "boolean" ? stored.wordWrap : DEFAULTS.wordWrap,
    minimap: typeof stored.minimap === "boolean" ? stored.minimap : DEFAULTS.minimap,
    autoSave: typeof stored.autoSave === "boolean" ? stored.autoSave : DEFAULTS.autoSave,
  };
}

export async function saveSettings(patch: Partial<DoveeSettings>) {
  const current = await loadSettings();
  const next: DoveeSettings = { ...current, ...patch };
  if (patch.apiKey !== undefined) {
    next.apiKeys = { ...current.apiKeys, [next.provider]: patch.apiKey };
    next.apiKey = patch.apiKey;
  }
  if (patch.provider && patch.provider !== current.provider && patch.apiKey === undefined) {
    next.apiKey = next.apiKeys[patch.provider] || envKey(patch.provider);
  }
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function publicSettings(settings: DoveeSettings) {
  const key = settings.apiKey;
  return {
    provider: settings.provider,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort,
    workspace: settings.workspace,
    baseUrl: settings.baseUrl,
    hasApiKey: Boolean(key),
    apiKeyHint: key ? `••••${key.slice(-4)}` : "",
    theme: settings.theme,
    editorFontSize: settings.editorFontSize,
    wordWrap: settings.wordWrap,
    minimap: settings.minimap,
    autoSave: settings.autoSave,
  };
}
