"use client";

import { useState } from "react";
import { openFile } from "./file-tree";
import { useIde } from "@/stores/ide-store";

export function SearchPanel() {
  const hits = useIde((s) => s.searchHits);
  const query = useIde((s) => s.searchQuery);
  const [local, setLocal] = useState(query);

  async function run(q: string) {
    setLocal(q);
    if (!q.trim()) {
      useIde.getState().setSearch("", []);
      return;
    }
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    useIde.getState().setSearch(q, data.hits ?? []);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted">Search</div>
        <input
          value={local}
          onChange={(e) => void run(e.target.value)}
          placeholder="Regex or text…"
          className="mt-2 w-full rounded-md border border-line bg-bg px-2 py-1.5 text-xs outline-none focus:border-teal/40"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        {hits.map((hit, i) => (
          <button
            key={`${hit.path}:${hit.line}:${i}`}
            type="button"
            onClick={() => void openFile(hit.path)}
            className="mb-1 w-full rounded-md px-2 py-1.5 text-left hover:bg-white/5"
          >
            <div className="truncate font-mono text-[11px] text-teal/80">
              {hit.path}:{hit.line}
            </div>
            <div className="truncate text-[11px] text-muted">{hit.text}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
