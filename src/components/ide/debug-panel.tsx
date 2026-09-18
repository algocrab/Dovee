"use client";

import { Circle, Pause, Play, Square, StepBack, StepForward, Undo2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useIde } from "@/stores/ide-store";
import { debugAction, selectDebugFrame, startDebugging, stopDebugging } from "./debug-actions";
import { IconButton, PanelHeading } from "./chrome";
import { openFile } from "./file-tree";
import { cn } from "@/lib/cn";

function statusLabel(status: string) {
  if (status === "starting") return "Starting…";
  if (status === "running") return "Running";
  if (status === "paused") return "Paused";
  if (status === "stopped") return "Stopped";
  return "Idle";
}

export function DebugPanel() {
  const breakpoints = useIde((s) => s.breakpoints);
  const status = useIde((s) => s.debugStatus);
  const frames = useIde((s) => s.debugFrames);
  const vars = useIde((s) => s.debugVars);
  const output = useIde((s) => s.debugOutput);
  const paused = useIde((s) => s.debugPaused);
  const args = useIde((s) => s.debugArgs);
  const argsId = useId();
  const active = status === "starting" || status === "running" || status === "paused";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeading
        kicker="Run and debug"
        title={statusLabel(status)}
        actions={
          <>
            <IconButton title="Start debugging (F5)" onClick={() => void startDebugging()}>
              <Play className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title="Stop (Shift+F5)" onClick={() => void stopDebugging()}>
              <Square className="h-3.5 w-3.5" />
            </IconButton>
          </>
        }
      />
      <div className="flex items-center gap-0.5 border-b border-line px-2 py-1">
        <IconButton
          title={status === "paused" ? "Continue (F5)" : "Pause"}
          onClick={() => void debugAction(status === "paused" ? "continue" : "pause")}
        >
          {status === "paused" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </IconButton>
        <IconButton title="Step over (F10)" onClick={() => void debugAction("stepOver")}>
          <StepForward className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Step into (F11)" onClick={() => void debugAction("stepInto")}>
          <StepBack className="h-3.5 w-3.5 rotate-90" />
        </IconButton>
        <IconButton title="Step out (Shift+F11)" onClick={() => void debugAction("stepOut")}>
          <Undo2 className="h-3.5 w-3.5" />
        </IconButton>
        <span className="ml-auto font-mono text-[10px] text-muted">{active ? "node inspector" : "JS/TS files"}</span>
      </div>
      <div className="border-b border-line px-3 py-2">
        <label htmlFor={argsId} className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Args
        </label>
        <input
          id={argsId}
          value={args}
          onChange={(e) => useIde.getState().setDebugArgs(e.target.value)}
          placeholder="optional argv…"
          className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-[12px] outline-none"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Section title="Call stack">
          {frames.length === 0 ? (
            <Empty>{paused ? "No frames" : "Paused frames show up here"}</Empty>
          ) : (
            frames.map((frame) => (
              <button
                key={frame.id}
                type="button"
                onClick={() => {
                  void selectDebugFrame(frame.id);
                  if (frame.inWorkspace) void openFile(frame.path, { line: frame.line, column: frame.column });
                }}
                className={cn(
                  "flex w-full flex-col rounded-md px-2 py-1 text-left hover:bg-hover",
                  paused?.path === frame.path && paused.line === frame.line && "bg-gold/10",
                )}
              >
                <span className="truncate font-mono text-[12px]">{frame.functionName}</span>
                <span className="truncate font-mono text-[10px] text-muted">
                  {frame.path}:{frame.line}
                </span>
              </button>
            ))
          )}
        </Section>
        <Section title="Variables">
          {vars.length === 0 ? (
            <Empty>Locals appear when paused</Empty>
          ) : (
            vars.map((item) => (
              <div key={item.name} className="flex gap-2 px-2 py-0.5 font-mono text-[12px]">
                <span className="shrink-0 text-teal">{item.name}</span>
                <span className="min-w-0 truncate text-muted" title={item.value}>
                  {item.value}
                </span>
              </div>
            ))
          )}
        </Section>
        <Section
          title={`Breakpoints (${breakpoints.length})`}
          action={
            breakpoints.length ? (
              <button
                type="button"
                className="text-[10px] text-muted hover:text-text"
                onClick={() => useIde.getState().clearBreakpoints()}
              >
                Clear
              </button>
            ) : null
          }
        >
          {breakpoints.length === 0 ? (
            <Empty>Click a line number to toggle</Empty>
          ) : (
            breakpoints.map((bp) => (
              <button
                key={bp.id}
                type="button"
                onClick={() => void openFile(bp.path, { line: bp.line, column: 1 })}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-hover"
              >
                <Circle className={cn("h-2.5 w-2.5", bp.enabled ? "fill-rose text-rose" : "text-muted")} />
                <span className="min-w-0 truncate font-mono text-[12px]">
                  {bp.path}:{bp.line}
                </span>
              </button>
            ))
          )}
        </Section>
        <Section title="Debug console">
          {output ? (
            <pre className="whitespace-pre-wrap px-2 pb-3 font-mono text-[11px] text-muted">{output}</pre>
          ) : (
            <Empty>stdout, stderr, and console.log</Empty>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-line/80 py-2">
      <div className="flex items-center justify-between px-3 pb-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-1 text-[12px] text-muted">{children}</p>;
}
