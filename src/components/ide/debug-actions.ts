import { canDebugPath } from "@/lib/debug-path";
import type { Breakpoint } from "@/types/debug";
import { useIde } from "@/stores/ide-store";
import { saveTab } from "./actions";

async function postDebug(body: Record<string, unknown>) {
  const res = await fetch("/api/debug", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(data.error ?? "Debug request failed");
  return data;
}

export function toggleBreakpointAt(path: string, line: number) {
  if (!path || path.includes("://")) return;
  useIde.getState().toggleBreakpoint(path, line);
  const { debugStatus, breakpoints } = useIde.getState();
  if (debugStatus !== "idle" && debugStatus !== "stopped") {
    void postDebug({ action: "breakpoints", breakpoints }).catch(() => {});
  }
}

export async function startDebugging() {
  const state = useIde.getState();
  const path = state.activePath;
  const tab = state.tabs.find((item) => item.path === path);
  if (!path || !tab || tab.kind === "diff" || !canDebugPath(path)) {
    state.setStatus("Open a JavaScript or TypeScript file to debug");
    return;
  }
  await saveTab(path);
  state.setLeftTab("debug");
  state.setDebugStatus("starting");
  try {
    await postDebug({
      action: "start",
      path,
      args: state.debugArgs,
      breakpoints: state.breakpoints,
    });
    state.setStatus(`Debugging ${path}`);
  } catch (error) {
    state.setDebugStatus("idle");
    state.setStatus(error instanceof Error ? error.message : "Could not start debugger");
  }
}

export async function stopDebugging() {
  try {
    await postDebug({ action: "stop" });
  } catch {
    /* session may already be gone */
  }
  useIde.getState().resetDebugSession();
}

export async function debugAction(action: "continue" | "pause" | "stepOver" | "stepInto" | "stepOut") {
  const status = useIde.getState().debugStatus;
  if (status === "idle" || status === "stopped") {
    if (action === "continue") await startDebugging();
    return;
  }
  try {
    await postDebug({ action });
  } catch (error) {
    useIde.getState().setStatus(error instanceof Error ? error.message : "Debug command failed");
  }
}

export async function selectDebugFrame(frameId: string) {
  try {
    await postDebug({ action: "frame", frameId });
  } catch {
    /* ignore */
  }
}

export function breakpointsFor(path: string): Breakpoint[] {
  return useIde.getState().breakpoints.filter((bp) => bp.path === path && bp.enabled);
}
