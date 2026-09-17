import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type ReasoningEffort = "none" | "low" | "high" | "max";

export type DoveeSettings = {
  apiKey: string;
  model: "deepseek-flash" | "deepseek-v4-pro";
  reasoningEffort: ReasoningEffort;
  workspace: string;
  baseUrl: string;
};

const SETTINGS_DIR = path.join(os.homedir(), ".dovee");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");

const DEFAULTS: DoveeSettings = {
  apiKey: "",
  model: "deepseek-flash",
  reasoningEffort: "high",
  workspace: process.cwd(),
  baseUrl: "https://api.deepseek.com",
};

export async function loadSettings(): Promise<DoveeSettings> {
  let stored: Partial<DoveeSettings> = {};
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    stored = JSON.parse(raw) as Partial<DoveeSettings>;
  } catch {
    stored = {};
  }

  const apiKey =
    stored.apiKey ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.DEEPSEEK_KEY ||
    "";

  return {
    ...DEFAULTS,
    ...stored,
    apiKey,
    baseUrl: stored.baseUrl || process.env.DEEPSEEK_BASE_URL || DEFAULTS.baseUrl,
    model:
      stored.model ||
      (process.env.DEEPSEEK_MODEL as DoveeSettings["model"]) ||
      DEFAULTS.model,
    workspace: stored.workspace || process.cwd(),
  };
}

export async function saveSettings(patch: Partial<DoveeSettings>) {
  const current = await loadSettings();
  const next: DoveeSettings = { ...current, ...patch };
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function publicSettings(settings: DoveeSettings) {
  const key = settings.apiKey;
  return {
    model: settings.model,
    reasoningEffort: settings.reasoningEffort,
    workspace: settings.workspace,
    baseUrl: settings.baseUrl,
    hasApiKey: Boolean(key),
    apiKeyHint: key ? `••••${key.slice(-4)}` : "",
  };
}
