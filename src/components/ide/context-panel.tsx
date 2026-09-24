"use client";

import { BrainCircuit, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { openFile } from "./file-tree";
import { PanelHeading } from "./chrome";
import { useIde } from "@/stores/ide-store";

type ContextHit = {
  path: string;
  score: number;
  reason: string;
  symbols: string[];
  imports: string[];
  preview: string;
};

export function ContextPanel() {
  const activePath = useIde((state) => state.activePath);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ContextHit[]>([]);
  const [loading, setLoading] = useState(false);

  async function inspect(refresh = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query || activePath || "workspace" });
      if (activePath) params.set("activeFile", activePath);
      if (refresh) params.set("refresh", "1");
      const data = (await fetch(`/api/context?${params}`).then((response) => response.json())) as { files?: ContextHit[] };
      setHits(data.files ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void inspect(), 0);
    // Inspect only when the user changes the active file, not on every keystroke.
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeading
        kicker="Context"
        title="Ranked workspace context"
        actions={
          <button type="button" onClick={() => void inspect(true)} disabled={loading} className="rounded-md p-1 text-muted hover:bg-hover hover:text-text" title="Refresh context">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        }
      />
      <form className="border-b border-line px-2 pb-2" onSubmit={(event) => { event.preventDefault(); void inspect(); }}>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-bg px-2 py-1.5">
          <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-teal" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Task, symbol, or file…"
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted"
          />
        </div>
      </form>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {!hits.length && <p className="px-2 py-4 text-[12px] text-muted">No ranked context yet.</p>}
        <div className="grid gap-1.5">
          {hits.map((hit) => (
            <button
              type="button"
              key={hit.path}
              onClick={() => void openFile(hit.path)}
              className="rounded-lg border border-line bg-bg/40 p-2 text-left hover:border-teal/30 hover:bg-hover"
              title={hit.preview}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-teal">{hit.path}</span>
                <span className="shrink-0 text-[10px] text-muted">{hit.reason}</span>
              </div>
              <div className="mt-1 truncate text-[11px] text-muted">
                {hit.symbols.slice(0, 5).join(" · ") || hit.imports.slice(0, 4).join(" · ") || "No symbols detected"}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
