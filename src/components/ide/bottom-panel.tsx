"use client";

import { AlertCircle, Plus, SquareTerminal } from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/cn";
import { useIde } from "@/stores/ide-store";
import { ProblemsPanel } from "./problems-panel";

const TerminalPanel = dynamic(() => import("./terminal-panel").then((m) => m.TerminalPanel), { ssr: false });

export function BottomPanel() {
  const tab = useIde((s) => s.bottomTab);
  const problems = useIde((s) => s.problems);
  const err = problems.filter((p) => p.severity === "error").length;

  return (
    <div className="flex h-full flex-col border-t border-line bg-bg">
      <div className="flex items-center gap-1 border-b border-line px-2">
        <button
          type="button"
          onClick={() => useIde.getState().setBottomTab("terminal")}
          className={cn(
            "inline-flex items-center gap-1.5 border-b-2 px-2 py-1.5 text-[13px]",
            tab === "terminal" ? "border-teal text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          <SquareTerminal className="h-3.5 w-3.5" />
          Terminal
        </button>
        <button
          type="button"
          onClick={() => useIde.getState().setBottomTab("problems")}
          className={cn(
            "inline-flex items-center gap-1.5 border-b-2 px-2 py-1.5 text-[13px]",
            tab === "problems" ? "border-teal text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          Problems{problems.length ? ` (${err || problems.length})` : ""}
        </button>
        <div className="flex-1" />
        {tab === "terminal" && (
          <button
            type="button"
            onClick={() => useIde.getState().addTerminal()}
            className="rounded p-1 text-muted hover:bg-hover hover:text-text"
            title="New terminal"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <div className={cn("absolute inset-0", tab !== "terminal" && "invisible")}>
          <TerminalPanel hideHeaderPlus />
        </div>
        {tab === "problems" && (
          <div className="absolute inset-0">
            <ProblemsPanel />
          </div>
        )}
      </div>
    </div>
  );
}
