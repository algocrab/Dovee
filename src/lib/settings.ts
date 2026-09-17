import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getProvider, type ProviderId } from "./providers";
import type { ThemeId } from "./theme";
import { clampMaxToolRounds, DEFAULT_MAX_TOOL_ROUNDS } from "./tool-rounds";

export type ReasoningEffort = "none" | "low" | "high" | "max";

export type DoveeSettings = {
  apiKey: string;
  apiKeys: Record<string, string>;
  provider: ProviderId;
  model: string;
  reasoningEffort: ReasoningEffort;
  workspace: string;
  desktopWorkspace?: string;
  baseUrl: string;
  theme: ThemeId;
  editorFontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  autoSave: boolean;
  maxToolRounds: number;
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

function envValue(name: string) {
  return process.env[name];
}

function isPackagedApp() {
  if (envValue("DOVEE_PACKAGED") === "1") return true;
  if (existsSync(path.join(process.cwd(), ".dovee-desktop"))) return true;
  return existsSync(path.join(os.homedir(), ".dovee", "packaged"));
}

function emptyUserWorkspace() {
  return path.join(os.homedir(), "Dovee");
}

function isPlaceholderWorkspace(dir?: string) {
  if (!dir?.trim()) return true;
  return path.resolve(/* turbopackIgnore: true */ dir) === path.resolve(/* turbopackIgnore: true */ emptyUserWorkspace());
}

function defaultDevWorkspace() {
  const cwd = process.cwd();
  const norm = cwd.replace(/\\/g, "/").toLowerCase();
  if (norm.endsWith("/resources/standalone") || norm.endsWith("/.next/standalone")) {
    return emptyUserWorkspace();
  }
  return cwd;
}

async function isAppBundleWorkspace(dir: string) {
  const abs = path.resolve(/* turbopackIgnore: true */ dir);
  const norm = abs.replace(/\\/g, "/").toLowerCase();
  if (norm.endsWith("/resources/standalone") || norm.endsWith("/.next/standalone")) return true;
  if (path.basename(abs) !== "standalone") return false;
  try {
    const server = await fs.readFile(path.join(abs, "server.js"), "utf8");
    return server.includes("next/dist/server/lib/start-server");
  } catch {
    return false;
  }
}

async function sanitizeWorkspace(dir: string) {
  const abs = path.resolve(/* turbopackIgnore: true */ dir);
  if (await isAppBundleWorkspace(abs)) return emptyUserWorkspace();
  return abs;
}

async function readStored(): Promise<Partial<DoveeSettings>> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    return JSON.parse(raw) as Partial<DoveeSettings>;
  } catch {
    return {};
  }
}

const DEFAULTS: DoveeSettings = {
  apiKey: "",
  apiKeys: {},
  provider: "deepseek",
  model: "deepseek-flash",
  reasoningEffort: "high",
  workspace: path.join(os.homedir(), "Dovee"),
  baseUrl: "https://api.deepseek.com",
  theme: "dark",
  editorFontSize: 15,
  wordWrap: true,
  minimap: false,
  autoSave: false,
  maxToolRounds: DEFAULT_MAX_TOOL_ROUNDS,
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
  const stored = await readStored();

  const provider = asProvider(stored.provider);
  const preset = getProvider(provider);
  const apiKeys = stored.apiKeys ?? {};
  const apiKey = apiKeys[provider] || stored.apiKey || envKey(provider);
  const packaged = isPackagedApp();
  const envWorkspace = process.env.DOVEE_WORKSPACE?.trim();
  const desktopMode = packaged || Boolean(envWorkspace);
  const opened = stored.desktopWorkspace?.trim();
  const hasOpened = Boolean(opened) && !isPlaceholderWorkspace(opened);
  const chosen = desktopMode
    ? (hasOpened && opened ? opened : envWorkspace || emptyUserWorkspace())
    : envWorkspace || stored.workspace || defaultDevWorkspace();
  const workspace = await sanitizeWorkspace(chosen);

  return {
    ...DEFAULTS,
    ...stored,
    provider,
    apiKeys,
    apiKey,
    model: stored.model || preset.models[0] || DEFAULTS.model,
    baseUrl: stored.baseUrl || preset.baseUrl || DEFAULTS.baseUrl,
    workspace,
    desktopWorkspace: stored.desktopWorkspace,
    theme: stored.theme === "light" || stored.theme === "dusk" || stored.theme === "dark" ? stored.theme : DEFAULTS.theme,
    editorFontSize: typeof stored.editorFontSize === "number" ? stored.editorFontSize : DEFAULTS.editorFontSize,
    wordWrap: typeof stored.wordWrap === "boolean" ? stored.wordWrap : DEFAULTS.wordWrap,
    minimap: typeof stored.minimap === "boolean" ? stored.minimap : DEFAULTS.minimap,
    autoSave: typeof stored.autoSave === "boolean" ? stored.autoSave : DEFAULTS.autoSave,
    maxToolRounds: clampMaxToolRounds(stored.maxToolRounds),
  };
}

export async function saveSettings(patch: Partial<DoveeSettings>) {
  const stored = await readStored();
  const current = await loadSettings();
  const next: DoveeSettings = { ...current, ...patch };
  next.maxToolRounds = clampMaxToolRounds(next.maxToolRounds);
  if (patch.apiKey !== undefined) {
    next.apiKeys = { ...current.apiKeys, [next.provider]: patch.apiKey };
    next.apiKey = patch.apiKey;
  }
  if (patch.provider && patch.provider !== current.provider && patch.apiKey === undefined) {
    next.apiKey = next.apiKeys[patch.provider] || envKey(patch.provider);
  }

  const packaged = isPackagedApp() || Boolean(process.env.DOVEE_WORKSPACE?.trim());
  const fileOut: DoveeSettings = { ...next };
  if (packaged) {
    fileOut.desktopWorkspace = typeof patch.workspace === "string" ? next.workspace : stored.desktopWorkspace;
    fileOut.workspace = typeof stored.workspace === "string" && stored.workspace.trim()
      ? stored.workspace
      : next.workspace;
  } else {
    fileOut.workspace = next.workspace;
    fileOut.desktopWorkspace = stored.desktopWorkspace;
  }
  if (!fileOut.desktopWorkspace || isPlaceholderWorkspace(fileOut.desktopWorkspace)) {
    delete fileOut.desktopWorkspace;
  }

  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(fileOut, null, 2), "utf8");
  return next;
}

export function publicSettings(settings: DoveeSettings) {
  const key = settings.apiKey;
  return {
    provider: settings.provider,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort,
    workspace: settings.workspace,
    hasFolder: isPackagedApp() || Boolean(process.env.DOVEE_WORKSPACE?.trim())
      ? !isPlaceholderWorkspace(settings.desktopWorkspace)
      : true,
    baseUrl: settings.baseUrl,
    hasApiKey: Boolean(key),
    apiKeyHint: key ? `••••${key.slice(-4)}` : "",
    theme: settings.theme,
    editorFontSize: settings.editorFontSize,
    wordWrap: settings.wordWrap,
    minimap: settings.minimap,
    autoSave: settings.autoSave,
    maxToolRounds: settings.maxToolRounds,
  };
}
