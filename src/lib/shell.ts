import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { getWorkspaceRoot } from "./workspace";

type ShellState = {
  proc: ChildProcessWithoutNullStreams;
  cwd: string;
  listeners: Set<(chunk: string) => void>;
};

const g = globalThis as typeof globalThis & { __doveeShell?: ShellState };

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
    if (g.__doveeShell === state) g.__doveeShell = undefined;
  });
}

export async function getShell() {
  const cwd = await getWorkspaceRoot();
  const existing = g.__doveeShell;
  if (existing && !existing.proc.killed && existing.cwd === cwd) return existing;

  if (existing && !existing.proc.killed) {
    existing.proc.kill();
  }

  const proc = spawn("powershell.exe", ["-NoLogo", "-NoExit"], {
    cwd,
    env: { ...process.env },
    windowsHide: true,
  });

  const state: ShellState = { proc, cwd, listeners: new Set() };
  attach(state);
  g.__doveeShell = state;
  return state;
}

export async function writeShell(data: string) {
  const shell = await getShell();
  shell.proc.stdin.write(data);
}

export async function subscribeShell(listener: (chunk: string) => void) {
  const shell = await getShell();
  shell.listeners.add(listener);
  return () => {
    shell.listeners.delete(listener);
  };
}

export async function restartShell() {
  const existing = g.__doveeShell;
  if (existing && !existing.proc.killed) existing.proc.kill();
  g.__doveeShell = undefined;
  return getShell();
}
