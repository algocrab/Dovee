"use client";

import { AlertCircle, AlertTriangle } from "lucide-react";
import { openFile } from "./file-tree";
import { useIde } from "@/stores/ide-store";

export function ProblemsPanel() {
  const problems = useIde((s) => s.problems);
  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.filter((p) => p.severity === "warning").length;

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="px-3 py-2 text-[13px] text-muted">
        {problems.length === 0 ? "No problems in this workspace." : `${errors} errors, ${warnings} warnings`}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {problems.map((p, i) => (
          <button
            key={`${p.path}:${p.line}:${p.column}:${i}`}
            type="button"
            onClick={() => void openFile(p.path)}
            className="mb-0.5 flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover"
          >
            {p.severity === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[13px]">{p.message}</span>
              <span className="font-mono text-[12px] text-muted">
                {p.path}:{p.line}:{p.column} {p.code}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
