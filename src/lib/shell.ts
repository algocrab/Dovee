import { createRequire } from "node:module";
import type { IDisposable, IPty } from "node-pty";
import { getWorkspaceRoot } from "./workspace";

type PtyModule = typeof import("node-pty");

let ptyModule: PtyModule | undefined;

function loadPty(): PtyModule {
  if (ptyModule) return ptyModule;
  const require = createRequire(__filename);
  ptyModule = require("node-pty") as PtyModule;
  return ptyModule;
}

type ShellState = {
  id: string;
  proc: IPty;
  cwd: string;
  cols: number;
  rows: number;
  listeners: Set<(chunk: string) => void>;
  subscriptions: IDisposable[];
};

type ShellBag = Map<string, ShellState>;

const g = globalThis as typeof globalThis & { __doveeShells?: ShellBag };

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

function shells() {
  if (!g.__doveeShells) g.__doveeShells = new Map();
  return g.__doveeShells;
}

function attach(state: ShellState) {
  state.subscriptions.push(
    state.proc.onData((chunk: string) => {
      for (const listener of state.listeners) listener(chunk);
    }),
  );
  state.subscriptions.push(
    state.proc.onExit(({ exitCode }) => {
      const text = `\r\n[shell exited ${exitCode ?? "null"}]\r\n`;
      for (const listener of state.listeners) listener(text);
      detach(state);
      shells().delete(state.id);
    }),
  );
}

function detach(state: ShellState) {
  for (const sub of state.subscriptions) {
    try {
      sub.dispose();
    } catch {
      /* already disposed */
    }
  }
  state.subscriptions.length = 0;
}

function terminate(state: ShellState) {
  detach(state);
  try {
    state.proc.kill();
  } catch {
    /* process already gone */
  }
}

/**
 * Dovee's own server process leaks private Next/Turbopack env into every user
 * shell. That makes `npm run dev` inside the integrated terminal run against
 * the installed app directory, forces NODE_ENV=production, and breaks
 * `--webpack` with "Multiple bundler flags set". Strip them.
 */
const STRIP_ENV = new Set([
  "NODE_ENV",
  "PORT",
  "HOSTNAME",
  "TURBOPACK",
  "TURBO_CACHE_DIR",
  "__NEXT_PRIVATE_ORIGIN",
  "__NEXT_PRIVATE_STANDALONE_CONFIG",
  "__NEXT_PRIVATE_RUNTIME_TYPE",
]);

function shellEnv() {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (STRIP_ENV.has(key) || key.startsWith("__NEXT_PRIVATE_")) continue;
    env[key] = value;
  }
  env.TERM = "xterm-256color";
  return env;
}

function spawnShell(id: string, cwd: string, cols = DEFAULT_COLS, rows = DEFAULT_ROWS) {
  const isWin = process.platform === "win32";
  const file = isWin ? "powershell.exe" : process.env.SHELL || "bash";
  const args = isWin ? ["-NoLogo", "-NoExit"] : ["-i"];

  const proc = loadPty().spawn(file, args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env: shellEnv(),
  });

  const state: ShellState = {
    id,
    proc,
    cwd,
    cols,
    rows,
    listeners: new Set(),
    subscriptions: [],
  };
  attach(state);
  shells().set(id, state);
  return state;
}

export async function getShell(id: string, cols?: number, rows?: number) {
  const cwd = await getWorkspaceRoot();
  const existing = shells().get(id);
  if (existing && existing.cwd === cwd) return existing;
  if (existing) terminate(existing);
  return spawnShell(id, cwd, cols, rows);
}

export async function writeShell(id: string, data: string) {
  const shell = await getShell(id);
  shell.proc.write(data);
}

export async function resizeShell(id: string, cols: number, rows: number) {
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
  // Only resize a shell that is already running — never spawn one just to size it.
  const shell = shells().get(id);
  if (!shell) return;
  const c = Math.max(2, Math.floor(cols));
  const r = Math.max(2, Math.floor(rows));
  shell.cols = c;
  shell.rows = r;
  try {
    shell.proc.resize(c, r);
  } catch {
    /* pty already gone */
  }
}

export async function subscribeShell(
  id: string,
  listener: (chunk: string) => void,
  cols?: number,
  rows?: number,
) {
  const shell = await getShell(id, cols, rows);
  shell.listeners.add(listener);
  return () => {
    shell.listeners.delete(listener);
  };
}

export async function restartShell(id: string) {
  const existing = shells().get(id);
  const cols = existing?.cols ?? DEFAULT_COLS;
  const rows = existing?.rows ?? DEFAULT_ROWS;
  if (existing) terminate(existing);
  shells().delete(id);
  return spawnShell(id, await getWorkspaceRoot(), cols, rows);
}

export async function killShell(id: string) {
  const existing = shells().get(id);
  if (existing) terminate(existing);
  shells().delete(id);
}

export async function restartAllShells() {
  const cwd = await getWorkspaceRoot();
  for (const [id, state] of shells()) {
    const { cols, rows } = state;
    terminate(state);
    shells().delete(id);
    spawnShell(id, cwd, cols, rows);
  }
}
