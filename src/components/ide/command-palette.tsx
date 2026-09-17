"use client";

import { useMemo, useState } from "react";
import { useIde } from "@/stores/ide-store";
import { openFile } from "./file-tree";

export function CommandPalette() {
  const open = useIde((s) => s.commandOpen);
  if (!open) return null;
  return <CommandPaletteInner />;
}

function CommandPaletteInner() {
  const files = useIde((s) => s.fileIndex);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  const hits = useMemo(() => {
    const needle = q.toLowerCase();
    return files.filter((f) => f.toLowerCase().includes(needle)).slice(0, 40);
  }, [files, q]);

  function choose(path: string) {
    useIde.getState().setCommandOpen(false);
    void openFile(path);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/45 pt-[12vh]" onClick={() => useIde.getState().setCommandOpen(false)}>
      <div
        className="h-fit w-full max-w-xl overflow-hidden rounded-xl border border-line bg-bg-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") useIde.getState().setCommandOpen(false);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(hits.length - 1, i + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(0, i - 1));
            }
            if (e.key === "Enter" && hits[idx]) choose(hits[idx]);
          }}
          placeholder="Go to file…"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-sm outline-none"
        />
        <div className="max-h-80 overflow-auto py-1">
          {hits.map((path, i) => (
            <button
              key={path}
              type="button"
              onClick={() => choose(path)}
              className={`block w-full truncate px-4 py-1.5 text-left font-mono text-xs ${i === idx ? "bg-teal/15 text-teal" : "text-muted hover:bg-white/5"}`}
            >
              {path}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
