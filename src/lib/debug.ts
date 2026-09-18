import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { getWorkspaceRoot, resolveSafe, toPosix } from "./workspace";
import { canDebugPath } from "./debug-path";
import type {
  Breakpoint,
  DebugEvent,
  DebugFrame,
  DebugPaused,
  DebugSnapshot,
  DebugStatus,
  DebugVar,
} from "@/types/debug";

export type { Breakpoint, DebugEvent, DebugFrame, DebugPaused, DebugSnapshot, DebugStatus, DebugVar };
export { canDebugPath };

const STRIP_ENV = new Set([
  "NODE_ENV",
  "PORT",
  "HOSTNAME",
  "TURBOPACK",
  "TURBO_CACHE_DIR",
  "NODE_OPTIONS",
]);

const OUTPUT_CAP = 32_000;
const VAR_CAP = 80;
const LISTEN_RE = /Debugger listening on (ws:\/\/\S+)/;

type Listener = (event: DebugEvent) => void;

type CdpPending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

class CdpClient {
  private ws: WebSocket;
  private nextId = 0;
  private pending = new Map<number, CdpPending>();
  onEvent: (method: string, params: Record<string, unknown>) => void = () => {};

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (ev) => this.onMessage(String(ev.data)));
    ws.addEventListener("close", () => this.failAll("Debugger disconnected"));
  }

  private onMessage(raw: string) {
    let msg: { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }
    if (typeof msg.id === "number") {
      const wait = this.pending.get(msg.id);
      if (!wait) return;
      this.pending.delete(msg.id);
      if (msg.error) wait.reject(new Error(msg.error.message ?? "CDP error"));
      else wait.resolve(msg.result);
      return;
    }
    if (msg.method) this.onEvent(msg.method, msg.params ?? {});
  }

  send(method: string, params?: Record<string, unknown>) {
    const id = ++this.nextId;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  close() {
    this.failAll("Debugger closed");
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }

  private failAll(message: string) {
    for (const wait of this.pending.values()) wait.reject(new Error(message));
    this.pending.clear();
  }
}

type Session = {
  proc: ChildProcess;
  cdp: CdpClient | null;
  status: DebugStatus;
  output: string;
  frames: DebugFrame[];
  vars: DebugVar[];
  paused: DebugPaused | null;
  error?: string;
  root: string;
  ready: boolean;
  skipEntry: boolean;
  callFrames: Record<string, unknown>[];
  scripts: Map<string, string>;
  breakpoints: Breakpoint[];
  pendingPause: Record<string, unknown> | null;
};

const g = globalThis as typeof globalThis & {
  __doveeDebug?: Session | null;
  __doveeDebugListeners?: Set<Listener>;
};

function listeners() {
  if (!g.__doveeDebugListeners) g.__doveeDebugListeners = new Set();
  return g.__doveeDebugListeners;
}

function session() {
  return g.__doveeDebug ?? null;
}

function emit(event: DebugEvent) {
  for (const listener of listeners()) listener(event);
}

function debugEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (STRIP_ENV.has(key) || key.startsWith("__NEXT_PRIVATE_")) continue;
    env[key] = value;
  }
  env.TERM = "xterm-256color";
  env.NODE_ENV = "development";
  return env as NodeJS.ProcessEnv;
}

export function subscribeDebug(listener: Listener) {
  listeners().add(listener);
  listener({ type: "snapshot", ...snapshot() });
  return () => {
    listeners().delete(listener);
  };
}

export function snapshot(): DebugSnapshot {
  const current = session();
  if (!current) {
    return { status: "idle", frames: [], vars: [], output: "", paused: null };
  }
  return {
    status: current.status,
    frames: current.frames,
    vars: current.vars,
    output: current.output,
    paused: current.paused,
    error: current.error,
  };
}

function appendOutput(current: Session, text: string, stream: "stdout" | "stderr" | "console") {
  current.output = (current.output + text).slice(-OUTPUT_CAP);
  emit({ type: "output", text, stream });
}

function setStatus(current: Session, status: DebugStatus, message?: string) {
  current.status = status;
  emit({ type: "status", status, message });
}

function sameRel(a: string, b: string) {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function posixFromUrl(root: string, url: string): { path: string; inWorkspace: boolean } {
  if (!url || url.startsWith("node:") || url.startsWith("internal/") || url.startsWith("v8/")) {
    return { path: url || "(unknown)", inWorkspace: false };
  }
  let abs = url.split("?")[0] ?? url;
  try {
    if (abs.startsWith("file:")) abs = fileURLToPath(abs);
  } catch {
    return { path: url, inWorkspace: false };
  }
  try {
    const rel = path.relative(root, abs);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      return { path: abs, inWorkspace: false };
    }
    return { path: rel.split(path.sep).join("/"), inWorkspace: true };
  } catch {
    return { path: abs, inWorkspace: false };
  }
}

function urlForFrame(current: Session, frame: Record<string, unknown>) {
  const direct = String(frame.url ?? "");
  if (direct) return direct;
  const loc = (frame.location ?? {}) as { scriptId?: string };
  if (loc.scriptId) return current.scripts.get(loc.scriptId) ?? "";
  return "";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fileUrlVariants(abs: string) {
  const href = pathToFileURL(abs).href;
  let decoded = href;
  try {
    decoded = decodeURI(href);
  } catch {
    /* keep encoded */
  }
  return [...new Set([href, decoded, href.toLowerCase(), decoded.toLowerCase()])];
}

function spawnTarget(abs: string, cwd: string, extraArgs: string[]) {
  const ts = /\.(ts|tsx|mts|cts)$/i.test(abs);
  if (ts) {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    return spawn(npx, ["--yes", "tsx", "--inspect-brk=0", abs, ...extraArgs], {
      cwd,
      env: debugEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }
  return spawn(process.execPath, ["--inspect-brk=0", abs, ...extraArgs], {
    cwd,
    env: debugEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function waitForWsUrl(proc: ChildProcess, timeoutMs = 12_000) {
  return new Promise<string>((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the Node inspector to start"));
    }, timeoutMs);
    const onData = (chunk: Buffer | string) => {
      buf += String(chunk);
      const match = LISTEN_RE.exec(buf);
      if (!match?.[1]) return;
      cleanup();
      resolve(match[1].replace(/\r?\n$/, ""));
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`Process exited before the debugger attached (${code ?? "null"})\n${buf.slice(-2000)}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      proc.stderr?.off("data", onData);
      proc.stdout?.off("data", onData);
      proc.off("exit", onExit);
    };
    proc.stderr?.on("data", onData);
    proc.stdout?.on("data", onData);
    proc.once("exit", onExit);
  });
}

function describeRemote(remote: Record<string, unknown> | undefined) {
  if (!remote) return { value: "undefined", type: "undefined" };
  const type = String(remote.type ?? "object");
  if ("value" in remote && (type === "string" || type === "number" || type === "boolean")) {
    return { value: type === "string" ? JSON.stringify(remote.value) : String(remote.value), type };
  }
  if (remote.unserializableValue) return { value: String(remote.unserializableValue), type };
  if (remote.description) return { value: String(remote.description), type };
  if (remote.subtype === "null") return { value: "null", type: "null" };
  return { value: type, type };
}

async function readLocals(cdp: CdpClient, frame: Record<string, unknown>): Promise<DebugVar[]> {
  const scopes = Array.isArray(frame.scopeChain) ? (frame.scopeChain as Record<string, unknown>[]) : [];
  const wanted = scopes.filter(
    (scope) => scope.type === "local" || scope.type === "block" || scope.type === "closure" || scope.type === "catch",
  );
  if (wanted.length === 0) {
    const fallback = scopes.find((scope) => scope.type !== "global");
    if (fallback) wanted.push(fallback);
  }
  const vars: DebugVar[] = [];
  const seen = new Set<string>();
  for (const scope of wanted) {
    const object = scope.object as { objectId?: string } | undefined;
    if (!object?.objectId) continue;
    try {
      const result = (await cdp.send("Runtime.getProperties", {
        objectId: object.objectId,
        ownProperties: true,
        generatePreview: true,
      })) as { result?: Array<{ name: string; value?: Record<string, unknown> }> };
      for (const item of result.result ?? []) {
        if (!item.name || item.name.startsWith("__") || seen.has(item.name)) continue;
        seen.add(item.name);
        const shown = describeRemote(item.value);
        vars.push({ name: item.name, value: shown.value.slice(0, 240), type: shown.type });
        if (vars.length >= VAR_CAP) return vars;
      }
    } catch {
      /* scope may have been released */
    }
  }
  return vars;
}

function framesFromPaused(current: Session, params: Record<string, unknown>): DebugFrame[] {
  const raw = Array.isArray(params.callFrames) ? (params.callFrames as Record<string, unknown>[]) : [];
  const frames: DebugFrame[] = [];
  for (const frame of raw.slice(0, 40)) {
    const loc = (frame.location ?? {}) as { lineNumber?: number; columnNumber?: number };
    const mapped = posixFromUrl(current.root, urlForFrame(current, frame));
    frames.push({
      id: String(frame.callFrameId ?? frames.length),
      functionName: String(frame.functionName || "(anonymous)"),
      path: mapped.path,
      line: (loc.lineNumber ?? 0) + 1,
      column: (loc.columnNumber ?? 0) + 1,
      inWorkspace: mapped.inWorkspace,
    });
  }
  return frames;
}

function isEntryPause(params: Record<string, unknown>) {
  const hits = Array.isArray(params.hitBreakpoints) ? params.hitBreakpoints : [];
  if (hits.length > 0) return false;
  const reason = String(params.reason ?? "");
  return reason === "other" || reason === "ambiguous" || /break on start/i.test(reason);
}

async function applyPaused(current: Session, params: Record<string, unknown>) {
  if (!current.cdp) return;
  if (!current.ready) {
    current.pendingPause = params;
    return;
  }
  if (current.skipEntry && isEntryPause(params)) {
    current.skipEntry = false;
    try {
      await current.cdp.send("Debugger.resume");
    } catch {
      /* already running */
    }
    return;
  }
  current.skipEntry = false;
  const frames = framesFromPaused(current, params);
  const top = frames.find((frame) => frame.inWorkspace) ?? frames[0];
  const paused: DebugPaused | null = top
    ? {
        path: top.path,
        line: top.line,
        column: top.column,
        reason: String(params.reason ?? "paused"),
      }
    : null;
  const rawFrames = Array.isArray(params.callFrames) ? (params.callFrames as Record<string, unknown>[]) : [];
  const topRaw =
    rawFrames[frames.findIndex((frame) => frame.inWorkspace)] ??
    rawFrames[0];
  current.callFrames = rawFrames;
  const vars = topRaw ? await readLocals(current.cdp, topRaw) : [];
  current.frames = frames;
  current.vars = vars;
  current.paused = paused;
  current.status = "paused";
  emit({ type: "paused", paused: paused ?? { path: "", line: 1, column: 1, reason: "paused" }, frames, vars });
}

async function setBreakpoints(cdp: CdpClient, root: string, breakpoints: Breakpoint[]) {
  for (const bp of breakpoints) {
    if (!bp.enabled) continue;
    try {
      const abs = resolveSafe(root, bp.path);
      const lineNumber = Math.max(0, bp.line - 1);
      for (const url of fileUrlVariants(abs)) {
        try {
          await cdp.send("Debugger.setBreakpointByUrl", {
            url,
            lineNumber,
            columnNumber: 0,
          });
        } catch {
          /* this URL spelling was not accepted */
        }
      }
      try {
        await cdp.send("Debugger.setBreakpointByUrl", {
          urlRegex: `${escapeRegex(path.basename(abs))}$`,
          lineNumber,
          columnNumber: 0,
        });
      } catch {
        /* regex form rejected */
      }
    } catch {
      /* invalid path */
    }
  }
}

async function bindScriptBreakpoints(current: Session, scriptId: string, url: string) {
  if (!current.cdp) return;
  const mapped = posixFromUrl(current.root, url);
  if (!mapped.inWorkspace) return;
  for (const bp of current.breakpoints) {
    if (!bp.enabled) continue;
    let rel = bp.path.replace(/\\/g, "/");
    try {
      rel = toPosix(current.root, resolveSafe(current.root, bp.path));
    } catch {
      /* keep raw path */
    }
    if (!sameRel(rel, mapped.path)) continue;
    try {
      await current.cdp.send("Debugger.setBreakpoint", {
        location: { scriptId, lineNumber: Math.max(0, bp.line - 1), columnNumber: 0 },
      });
    } catch {
      /* location may not be bindable yet */
    }
  }
}

async function attachCdp(current: Session, wsUrl: string, breakpoints: Breakpoint[]) {
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Inspector WebSocket timed out")), 8_000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Could not connect to the Node inspector"));
    });
  });
  const cdp = new CdpClient(ws);
  current.cdp = cdp;
  cdp.onEvent = (method, params) => {
    if (method === "Debugger.scriptParsed") {
      const scriptId = String(params.scriptId ?? "");
      const url = String(params.url ?? "");
      if (scriptId && url) {
        current.scripts.set(scriptId, url);
        void bindScriptBreakpoints(current, scriptId, url);
      }
    }
    if (method === "Debugger.paused") void applyPaused(current, params);
    if (method === "Debugger.resumed") {
      current.status = "running";
      current.paused = null;
      current.callFrames = [];
      emit({ type: "resumed" });
    }
    if (method === "Runtime.consoleAPICalled") {
      const args = Array.isArray(params.args) ? (params.args as Record<string, unknown>[]) : [];
      const text = `${args.map((arg) => describeRemote(arg).value).join(" ")}\n`;
      appendOutput(current, text, "console");
    }
    if (method === "Runtime.exceptionThrown") {
      const details = (params.exceptionDetails ?? {}) as { text?: string; exception?: Record<string, unknown> };
      const text = `${details.text ?? "Exception"} ${describeRemote(details.exception).value}\n`;
      appendOutput(current, text, "stderr");
    }
  };
  await cdp.send("Debugger.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Debugger.setBreakpointsActive", { active: true });
  await setBreakpoints(cdp, current.root, breakpoints);
  current.ready = true;
  try {
    await cdp.send("Runtime.runIfWaitingForDebugger");
  } catch {
    /* already running */
  }
  if (current.pendingPause) {
    const queued = current.pendingPause;
    current.pendingPause = null;
    await applyPaused(current, queued);
  }
  if (current.status === "starting" && !current.paused) setStatus(current, "running");
}

function pipeProc(current: Session) {
  current.proc.stdout?.on("data", (chunk: Buffer) => appendOutput(current, String(chunk), "stdout"));
  current.proc.stderr?.on("data", (chunk: Buffer) => {
    const text = String(chunk);
    if (LISTEN_RE.test(text) || /Waiting for the debugger to disconnect/i.test(text)) return;
    appendOutput(current, text, "stderr");
  });
  current.proc.on("exit", (code) => {
    current.status = "stopped";
    current.paused = null;
    current.cdp?.close();
    current.cdp = null;
    emit({ type: "stopped", code });
    g.__doveeDebug = null;
  });
}

export async function startDebug(relPath: string, breakpoints: Breakpoint[], extraArgs: string[] = []) {
  await stopDebug();
  const root = await getWorkspaceRoot();
  if (!canDebugPath(relPath)) {
    throw new Error("Can only debug JavaScript or TypeScript files");
  }
  const abs = resolveSafe(root, relPath);
  const proc = spawnTarget(abs, root, extraArgs);
  const current: Session = {
    proc,
    cdp: null,
    status: "starting",
    output: "",
    frames: [],
    vars: [],
    paused: null,
    root,
    ready: false,
    skipEntry: true,
    callFrames: [],
    scripts: new Map(),
    breakpoints,
    pendingPause: null,
  };
  g.__doveeDebug = current;
  emit({ type: "snapshot", ...snapshot() });
  setStatus(current, "starting", `Launching ${relPath}`);
  pipeProc(current);
  try {
    const wsUrl = await waitForWsUrl(proc);
    await attachCdp(current, wsUrl, breakpoints);
  } catch (error) {
    current.error = error instanceof Error ? error.message : String(error);
    emit({ type: "error", message: current.error });
    await stopDebug();
    throw error;
  }
}

export async function stopDebug() {
  const current = session();
  if (!current) return;
  current.ready = false;
  current.cdp?.close();
  current.cdp = null;
  try {
    current.proc.kill();
  } catch {
    /* already gone */
  }
  g.__doveeDebug = null;
  emit({ type: "stopped", code: null });
}

export async function debugCommand(action: "continue" | "pause" | "stepOver" | "stepInto" | "stepOut") {
  const current = session();
  if (!current?.cdp) throw new Error("No active debug session");
  const methods: Record<typeof action, string> = {
    continue: "Debugger.resume",
    pause: "Debugger.pause",
    stepOver: "Debugger.stepOver",
    stepInto: "Debugger.stepInto",
    stepOut: "Debugger.stepOut",
  };
  await current.cdp.send(methods[action]);
}

export async function loadFrame(frameId: string) {
  const current = session();
  if (!current?.cdp) throw new Error("No active debug session");
  const frame = current.callFrames.find((item) => String(item.callFrameId) === frameId) ?? current.callFrames[0];
  const vars = frame ? await readLocals(current.cdp, frame) : [];
  current.vars = vars;
  const mapped = current.frames.find((item) => item.id === frameId);
  if (mapped) {
    current.paused = {
      path: mapped.path,
      line: mapped.line,
      column: mapped.column,
      reason: current.paused?.reason ?? "paused",
    };
    emit({
      type: "paused",
      paused: current.paused,
      frames: current.frames,
      vars,
    });
    return;
  }
  emit({ type: "variables", vars });
}

export async function syncBreakpoints(breakpoints: Breakpoint[]) {
  const current = session();
  if (!current?.cdp || current.status === "idle") return;
  current.breakpoints = breakpoints;
  try {
    await current.cdp.send("Debugger.setBreakpointsActive", { active: true });
    await setBreakpoints(current.cdp, current.root, breakpoints);
    for (const [scriptId, url] of current.scripts) {
      await bindScriptBreakpoints(current, scriptId, url);
    }
  } catch {
    /* session may have ended */
  }
}
