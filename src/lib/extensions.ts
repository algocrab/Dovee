import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { loadSettings, saveSettings } from "./settings";
import { getWorkspaceRoot, resolveSafe, toPosix } from "./workspace";
import type {
  ExtensionCommand,
  ExtensionInfo,
  ExtensionKeybinding,
  ExtensionManifest,
  ExtensionRunResult,
  ExtensionSnippet,
  ExtensionSource,
  ExtensionTheme,
} from "@/types/extension";
import { builtinManifests } from "./builtin-extensions";

export type { ExtensionCommand, ExtensionInfo, ExtensionManifest, ExtensionRunResult, ExtensionSource };

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const RUN_MS = 8_000;
const EXT_DIR = [".dovee", "extensions"] as const;

type Handler = () => Promise<unknown> | unknown;

type Runtime = {
  handlers: Map<string, { extensionId: string; run: Handler }>;
  activated: Set<string>;
  lastError: Map<string, string>;
  statusSink: (text: string) => void;
};

const g = globalThis as typeof globalThis & { __doveeExt?: Runtime };

function runtime(): Runtime {
  if (!g.__doveeExt) {
    g.__doveeExt = {
      handlers: new Map(),
      activated: new Set(),
      lastError: new Map(),
      statusSink: () => {},
    };
  }
  return g.__doveeExt;
}

function asCommands(value: unknown): ExtensionCommand[] {
  if (!Array.isArray(value)) return [];
  const out: ExtensionCommand[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<ExtensionCommand>;
    if (typeof row.id !== "string" || typeof row.title !== "string") continue;
    if (!ID_RE.test(row.id)) continue;
    out.push({
      id: row.id,
      title: row.title.slice(0, 80),
      message: typeof row.message === "string" ? row.message.slice(0, 240) : undefined,
      insert: typeof row.insert === "string" ? row.insert.slice(0, 400) : undefined,
      themeId: typeof row.themeId === "string" ? row.themeId.slice(0, 40) : undefined,
    });
  }
  return out;
}

function asSnippets(value: unknown): ExtensionSnippet[] {
  if (!Array.isArray(value)) return [];
  const out: ExtensionSnippet[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<ExtensionSnippet>;
    if (typeof row.prefix !== "string" || typeof row.body !== "string" || typeof row.language !== "string") continue;
    out.push({
      prefix: row.prefix.trim().slice(0, 40),
      body: row.body.slice(0, 500),
      description: typeof row.description === "string" ? row.description.slice(0, 80) : undefined,
      language: row.language.trim().slice(0, 40),
    });
    if (out.length >= 40) break;
  }
  return out;
}

function asThemes(value: unknown): ExtensionTheme[] {
  if (!Array.isArray(value)) return [];
  const out: ExtensionTheme[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<ExtensionTheme>;
    if (typeof row.id !== "string" || typeof row.label !== "string" || typeof row.css !== "string") continue;
    if (!ID_RE.test(row.id)) continue;
    const editor = row.editor && typeof row.editor === "object" ? row.editor : undefined;
    out.push({
      id: row.id,
      label: row.label.slice(0, 40),
      css: row.css.slice(0, 4000),
      editor: editor
        ? {
            background: String(editor.background ?? "").slice(0, 20),
            foreground: String(editor.foreground ?? "").slice(0, 20),
            cursor: editor.cursor ? String(editor.cursor).slice(0, 20) : undefined,
            selection: editor.selection ? String(editor.selection).slice(0, 20) : undefined,
            lineNumber: editor.lineNumber ? String(editor.lineNumber).slice(0, 20) : undefined,
          }
        : undefined,
    });
    if (out.length >= 4) break;
  }
  return out;
}

function asKeybindings(value: unknown): ExtensionKeybinding[] {
  if (!Array.isArray(value)) return [];
  const out: ExtensionKeybinding[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<ExtensionKeybinding>;
    if (typeof row.command !== "string" || typeof row.key !== "string") continue;
    if (!ID_RE.test(row.command)) continue;
    out.push({ command: row.command, key: row.key.trim().toLowerCase().slice(0, 40) });
    if (out.length >= 20) break;
  }
  return out;
}

function parseManifest(raw: unknown, fallbackId: string): ExtensionManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<ExtensionManifest>;
  const id = typeof row.id === "string" && ID_RE.test(row.id) ? row.id : fallbackId;
  if (!ID_RE.test(id)) return null;
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 80) : id;
  return {
    id,
    name,
    version: typeof row.version === "string" && row.version.trim() ? row.version.trim().slice(0, 32) : "0.0.0",
    description: typeof row.description === "string" ? row.description.trim().slice(0, 280) : "",
    publisher: typeof row.publisher === "string" ? row.publisher.trim().slice(0, 80) : undefined,
    main: typeof row.main === "string" ? row.main.trim() : undefined,
    engines: row.engines?.vscode ? { vscode: String(row.engines.vscode).slice(0, 32) } : undefined,
    activationEvents: Array.isArray(row.activationEvents)
      ? row.activationEvents.filter((event): event is string => typeof event === "string").slice(0, 20)
      : [],
    permissions: Array.isArray(row.permissions)
      ? row.permissions.filter((permission): permission is NonNullable<ExtensionManifest["permissions"]>[number] =>
          ["workspace.read", "workspace.write", "commands", "status", "editor"].includes(permission as string),
        )
      : ["commands", "status"],
    contributes: {
      commands: asCommands(row.contributes?.commands),
      snippets: asSnippets(row.contributes?.snippets),
      themes: asThemes(row.contributes?.themes),
      keybindings: asKeybindings(row.contributes?.keybindings),
    },
  };
}

function builtins(): ExtensionManifest[] {
  return builtinManifests();
}

function safeMain(folder: string, main: string) {
  const rel = main.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!rel || rel.includes("..") || path.isAbsolute(rel)) return null;
  if (!/\.(cjs|js)$/i.test(rel)) return null;
  const abs = path.resolve(folder, rel);
  const nested = path.relative(folder, abs);
  if (!nested || nested.startsWith("..") || path.isAbsolute(nested)) return null;
  return abs;
}

async function readManifestFile(file: string, fallbackId: string) {
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as unknown;
    return parseManifest(raw, fallbackId);
  } catch {
    return null;
  }
}

async function scanWorkspace(root: string): Promise<Array<ExtensionManifest & { folder: string }>> {
  const dir = path.join(root, ...EXT_DIR);
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const found: Array<ExtensionManifest & { folder: string }> = [];
  const seen = new Set(builtins().map((item) => item.id));
  for (const name of names) {
    const folder = path.join(dir, name);
    try {
      const stat = await fs.stat(folder);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }
    const manifest = await readManifestFile(path.join(folder, "extension.json"), name);
    if (!manifest || seen.has(manifest.id)) continue;
    seen.add(manifest.id);
    found.push({ ...manifest, folder });
  }
  return found;
}

async function loadModule(abs: string) {
  const req = createRequire(abs);
  const resolved = req.resolve(abs);
  delete req.cache[resolved];
  return req(resolved) as { activate?: (api: unknown) => unknown };
}

function bindApi(extensionId: string, root: string, allowed: Set<string>) {
  const rt = runtime();
  return {
    commands: {
      registerCommand(id: string, run: Handler) {
        if (typeof id !== "string" || typeof run !== "function") return;
        if (!allowed.has(id) && !id.startsWith(`${extensionId}.`)) return;
        rt.handlers.set(id, { extensionId, run });
      },
    },
    window: {
      showStatus(message: unknown) {
        rt.statusSink(String(message ?? "").slice(0, 240));
      },
    },
    workspace: {
      async readFile(relPath: string) {
        const abs = resolveSafe(root, String(relPath ?? ""));
        return fs.readFile(abs, "utf8");
      },
    },
  };
}

function dropExtension(id: string) {
  const rt = runtime();
  rt.activated.delete(id);
  rt.lastError.delete(id);
  for (const [commandId, handler] of rt.handlers) {
    if (handler.extensionId === id) rt.handlers.delete(commandId);
  }
}

async function activateOne(
  manifest: ExtensionManifest,
  folder: string | undefined,
  root: string,
) {
  const rt = runtime();
  dropExtension(manifest.id);
  const commands = manifest.contributes?.commands ?? [];
  const allowed = new Set(commands.map((item) => item.id));
  for (const command of commands) {
    if (!command.message) continue;
    const message = command.message;
    rt.handlers.set(command.id, {
      extensionId: manifest.id,
      run: () => ({ status: message }),
    });
  }
  if (!folder || !manifest.main) {
    rt.activated.add(manifest.id);
    return;
  }
  const mainAbs = safeMain(folder, manifest.main);
  if (!mainAbs) {
    rt.lastError.set(manifest.id, "extension.json main must be a .js file inside the extension folder");
    rt.activated.add(manifest.id);
    return;
  }
  try {
    const mod = await loadModule(mainAbs);
    const activate = mod.activate;
    if (typeof activate !== "function") {
      rt.lastError.set(manifest.id, "main must export activate(dovee)");
      rt.activated.add(manifest.id);
      return;
    }
    const api = bindApi(manifest.id, root, allowed);
    await Promise.resolve(activate(api));
    rt.activated.add(manifest.id);
  } catch (error) {
    rt.lastError.set(manifest.id, error instanceof Error ? error.message : String(error));
    rt.activated.add(manifest.id);
  }
}

async function collect() {
  const root = await getWorkspaceRoot();
  const settings = await loadSettings();
  const disabled = new Set(settings.disabledExtensions);
  const workspace = await scanWorkspace(root);
  const all: Array<{ manifest: ExtensionManifest; source: ExtensionSource; folder?: string }> = [
    ...builtins().map((manifest) => ({ manifest, source: "builtin" as const })),
    ...workspace.map((item) => {
      const { folder, ...manifest } = item;
      return { manifest, source: "workspace" as const, folder };
    }),
  ];
  for (const item of all) {
    if (disabled.has(item.manifest.id)) {
      dropExtension(item.manifest.id);
      continue;
    }
    await activateOne(item.manifest, item.folder, root);
  }
  const infos: ExtensionInfo[] = all.map((item) => ({
    id: item.manifest.id,
    name: item.manifest.name,
    version: item.manifest.version,
    description: item.manifest.description,
    publisher: item.manifest.publisher,
    permissions: item.manifest.permissions ?? ["commands", "status"],
    enabled: !disabled.has(item.manifest.id),
    source: item.source,
    folder: item.folder ? toPosix(root, item.folder) : undefined,
    commands: item.manifest.contributes?.commands ?? [],
    snippets: item.manifest.contributes?.snippets ?? [],
    themes: item.manifest.contributes?.themes ?? [],
    keybindings: item.manifest.contributes?.keybindings ?? [],
    error: runtime().lastError.get(item.manifest.id),
  }));
  return infos;
}

export async function listExtensions() {
  return collect();
}

export async function reloadExtensions() {
  const rt = runtime();
  rt.handlers.clear();
  rt.activated.clear();
  rt.lastError.clear();
  return collect();
}

export async function toggleExtension(id: string, enabled: boolean) {
  if (!ID_RE.test(id)) throw new Error("Invalid extension id");
  const settings = await loadSettings();
  const disabled = new Set(settings.disabledExtensions);
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  await saveSettings({ disabledExtensions: [...disabled].slice(0, 100) });
  return reloadExtensions();
}

export async function runExtensionCommand(commandId: string): Promise<ExtensionRunResult> {
  if (!ID_RE.test(commandId)) return { ok: false, error: "Unknown command" };
  await collect();
  const handler = runtime().handlers.get(commandId);
  if (!handler) return { ok: false, error: "Command is not available (extension disabled?)" };
  const settings = await loadSettings();
  if (settings.disabledExtensions.includes(handler.extensionId)) {
    return { ok: false, error: "Extension is disabled" };
  }
  const rt = runtime();
  let status: string | undefined;
  let openPath: string | undefined;
  rt.statusSink = (text) => {
    status = text;
  };
  try {
    const result = await Promise.race([
      Promise.resolve(handler.run()),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Extension command timed out")), RUN_MS);
      }),
    ]);
    if (result && typeof result === "object") {
      const row = result as { status?: unknown; openPath?: unknown };
      if (typeof row.status === "string") status = row.status.slice(0, 240);
      if (typeof row.openPath === "string") openPath = row.openPath;
    }
    return { ok: true, status, openPath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    rt.statusSink = () => {};
  }
}

const SAMPLE_JSON = `{
  "id": "hello-workspace",
  "name": "Hello Workspace",
  "version": "0.0.1",
  "description": "Sample workspace extension. Adds a command that writes the local time to the status bar.",
  "main": "extension.js",
  "contributes": {
    "commands": [
      { "id": "hello-workspace.time", "title": "Hello Workspace: Show Time" }
    ]
  }
}
`;

const SAMPLE_JS = `"use strict";

function activate(dovee) {
  dovee.commands.registerCommand("hello-workspace.time", async () => {
    dovee.window.showStatus("Hello Workspace · " + new Date().toLocaleTimeString());
  });
}

module.exports = { activate };
`;

export async function scaffoldSampleExtension() {
  const root = await getWorkspaceRoot();
  const folder = path.join(root, ...EXT_DIR, "hello-workspace");
  await fs.mkdir(folder, { recursive: true });
  const manifestAbs = path.join(folder, "extension.json");
  try {
    await fs.access(manifestAbs);
  } catch {
    await fs.writeFile(manifestAbs, SAMPLE_JSON, "utf8");
    await fs.writeFile(path.join(folder, "extension.js"), SAMPLE_JS, "utf8");
  }
  return reloadExtensions();
}
