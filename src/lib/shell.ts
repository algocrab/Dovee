import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { getWorkspaceRoot } from "./workspace";

type ShellState = {
  id: string;
  proc: ChildProcessWithoutNullStreams;
  cwd: string;
  listeners: Set<(chunk: string) => void>;
};

type ShellBag = Map<string, ShellState>;

const g = globalThis as typeof globalThis & { __doveeShells?: ShellBag };

function shells() {
  if (!g.__doveeShells) g.__doveeShells = new Map();
  return g.__doveeShells;
}

function attach(state: ShellState) {
  state.proc.stdout.on("data", (buf: Buffer) => {
    const text = buf.toString("utf8");
    for (const listener of state.listeners) listener(text);
  });
  state.proc.stderr.on("data", (buf: Buffer) => {
    const text = buf.toString("utf8");
    for (const listener of state.listeners) listener(text);
  });
  state.proc.on("exit", (code) => {
    const text = `\r\n[shell exited ${code ?? "null"}]\r\n`;
    for (const listener of state.listeners) listener(text);
    shells().delete(state.id);
  });
}

function spawnShell(id: string, cwd: string) {
  const isWin = process.platform === "win32";
  const proc = isWin
    ? spawn("powershell.exe", ["-NoLogo", "-NoExit"], { cwd, env: { ...process.env }, windowsHide: true })
    : spawn("bash", ["-i"], { cwd, env: { ...process.env } });
  const state: ShellState = { id, proc, cwd, listeners: new Set() };
  attach(state);
  shells().set(id, state);
  return state;
}

export async function getShell(id: string) {
  const cwd = await getWorkspaceRoot();
  const existing = shells().get(id);
  if (existing && !existing.proc.killed && existing.cwd === cwd) return existing;
  if (existing && !existing.proc.killed) existing.proc.kill();
  return spawnShell(id, cwd);
}

export async function writeShell(id: string, data: string) {
  const shell = await getShell(id);
  shell.proc.stdin.write(data);
}

export async function subscribeShell(id: string, listener: (chunk: string) => void) {
  const shell = await getShell(id);
  shell.listeners.add(listener);
  return () => {
    shell.listeners.delete(listener);
  };
}

export async function restartShell(id: string) {
  const existing = shells().get(id);
  if (existing && !existing.proc.killed) existing.proc.kill();
  shells().delete(id);
  return getShell(id);
}

export async function killShell(id: string) {
  const existing = shells().get(id);
  if (existing && !existing.proc.killed) existing.proc.kill();
  shells().delete(id);
}

export async function restartAllShells() {
  const cwd = await getWorkspaceRoot();
  for (const [id, state] of shells()) {
    if (!state.proc.killed) state.proc.kill();
    shells().delete(id);
    spawnShell(id, cwd);
  }
}
