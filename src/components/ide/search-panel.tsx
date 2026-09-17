"use client";

import { CaseSensitive, FileType, Regex, Replace, WholeWord } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import type { SearchHit } from "@/stores/ide-store";
import { useIde } from "@/stores/ide-store";
import { PanelHeading } from "./chrome";
import { openFile, refreshRoot } from "./file-tree";

type SearchResult = {
  hits?: SearchHit[];
  total?: number;
  truncated?: boolean;
  error?: string;
};

function Toggle({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn("rounded p-1 text-muted hover:bg-hover hover:text-text", active && "bg-teal/15 text-teal")}
    >
      {children}
    </button>
  );
}

export function SearchPanel() {
  const query = useIde((s) => s.searchQuery);
  const hits = useIde((s) => s.searchHits);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [glob, setGlob] = useState("");
  const [replace, setReplace] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const pageSize = 80;

  const runSearch = useCallback(
    async (nextOffset = 0) => {
      const q = useIde.getState().searchQuery.trim();
      if (!q) {
        useIde.getState().setSearch("", []);
        setTotal(0);
        setTruncated(false);
        setOffset(0);
        setError("");
        setStatus("");
        return;
      }
      setBusy(true);
      setError("");
      setStatus("");
      try {
        const params = new URLSearchParams({
          q,
          offset: String(nextOffset),
          limit: String(pageSize),
        });
        if (caseSensitive) params.set("case", "1");
        if (useRegex) params.set("regex", "1");
        if (wholeWord) params.set("word", "1");
        if (glob.trim()) params.set("glob", glob.trim());

        const res = await fetch(`/api/search?${params.toString()}`);
        const data = (await res.json()) as SearchResult;
        if (data.error) {
          setError(data.error);
          useIde.getState().setSearch(q, []);
          setTotal(0);
          setTruncated(false);
          return;
        }
        const nextHits = data.hits ?? [];
        useIde.getState().setSearch(q, nextHits);
        setTotal(data.total ?? nextHits.length);
        setTruncated(Boolean(data.truncated));
        setOffset(nextOffset);
        setStatus(
          data.total
            ? `${data.total} result${data.total === 1 ? "" : "s"}${data.truncated ? " (truncated)" : ""}`
            : "No results",
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [caseSensitive, useRegex, wholeWord, glob],
  );

  async function runReplace(all: boolean) {
    const q = query.trim();
    if (!q) return;
    const label = all ? "all matches in the workspace" : "matches in the current result page";
    if (!window.confirm(`Replace ${label} with the replacement text? This writes files on disk.`)) {
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const body: Record<string, unknown> = {
        query: q,
        replace,
        caseSensitive,
        useRegex,
        wholeWord,
        glob: glob.trim() || undefined,
      };
      if (!all) {
        const paths = [...new Set(hits.map((h) => h.path))];
        body.paths = paths;
      }
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        filesChanged?: number;
        replacements?: number;
        error?: string;
        changedFiles?: string[];
      };
      if (!data.ok) {
        setError(data.error || "Replace failed");
        return;
      }
      setStatus(
        `Replaced ${data.replacements ?? 0} match${(data.replacements ?? 0) === 1 ? "" : "es"} in ${data.filesChanged ?? 0} file${(data.filesChanged ?? 0) === 1 ? "" : "s"}`,
      );
      // Refresh open clean tabs that were rewritten.
      for (const p of data.changedFiles ?? []) {
        try {
          const r = await fetch(`/api/files/read?path=${encodeURIComponent(p)}`);
          if (!r.ok) continue;
          const file = (await r.json()) as { content?: string };
          const tab = useIde.getState().tabs.find((t) => t.path === p);
          if (tab && tab.content === tab.original && typeof file.content === "string") {
            useIde.getState().reloadTab(p, file.content);
          }
        } catch {
          /* ignore */
        }
      }
      await refreshRoot();
      await runSearch(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeading kicker="Search" />
      <div className="space-y-1.5 border-b border-line px-2 pb-2">
        <div className="flex items-center gap-1">
          <input
            value={query}
            onChange={(e) => useIde.getState().setSearch(e.target.value, hits)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch(0);
            }}
            placeholder="Search"
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-[12px] outline-none"
          />
          <Toggle
            active={showReplace}
            title="Toggle replace"
            onClick={() => setShowReplace((v) => !v)}
          >
            <Replace className="h-3.5 w-3.5" />
          </Toggle>
        </div>

        {showReplace && (
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runReplace(true);
            }}
            placeholder="Replace"
            className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-[12px] outline-none"
          />
        )}

        <div className="flex items-center gap-1">
          <input
            value={glob}
            onChange={(e) => setGlob(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch(0);
            }}
            placeholder="files to include (e.g. src/**/*.ts)"
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-[11px] outline-none placeholder:text-muted"
          />
          <Toggle active={caseSensitive} title="Match case" onClick={() => setCaseSensitive((v) => !v)}>
            <CaseSensitive className="h-3.5 w-3.5" />
          </Toggle>
          <Toggle active={wholeWord} title="Match whole word" onClick={() => setWholeWord((v) => !v)}>
            <WholeWord className="h-3.5 w-3.5" />
          </Toggle>
          <Toggle active={useRegex} title="Use regular expression" onClick={() => setUseRegex((v) => !v)}>
            <Regex className="h-3.5 w-3.5" />
          </Toggle>
        </div>

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={busy || !query.trim()}
            onClick={() => void runSearch(0)}
            className="rounded-md border border-line px-2 py-1 text-[11px] hover:bg-hover disabled:opacity-40"
          >
            {busy ? "Searching…" : "Search"}
          </button>
          {showReplace && (
            <>
              <button
                type="button"
                disabled={busy || !query.trim() || hits.length === 0}
                onClick={() => void runReplace(false)}
                className="rounded-md border border-line px-2 py-1 text-[11px] hover:bg-hover disabled:opacity-40"
                title="Replace only in files from the current result page"
              >
                Replace page
              </button>
              <button
                type="button"
                disabled={busy || !query.trim()}
                onClick={() => void runReplace(true)}
                className="rounded-md border border-line px-2 py-1 text-[11px] hover:bg-hover disabled:opacity-40"
                title="Replace across the whole workspace (respects include glob)"
              >
                Replace all
              </button>
            </>
          )}
        </div>

        {(status || error) && (
          <div className={cn("text-[11px]", error ? "text-rose" : "text-muted")}>{error || status}</div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1">
        {hits.length === 0 && !busy && !error && (
          <p className="px-3 py-2 text-[12px] text-muted">
            {query.trim() ? "No results." : "Type a query and press Enter."}
          </p>
        )}
        {hits.map((hit, i) => (
          <button
            key={`${hit.path}:${hit.line}:${hit.column ?? 0}:${i}`}
            type="button"
            onClick={() => void openFile(hit.path, { line: hit.line, column: hit.column ?? 1 })}
            className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-hover"
          >
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
              <FileType className="h-3 w-3 shrink-0 opacity-70" />
              <span className="truncate">
                {hit.path}:{hit.line}
                {hit.column ? `:${hit.column}` : ""}
              </span>
            </span>
            <span className="truncate font-mono text-[12px] text-text">{hit.text}</span>
          </button>
        ))}
      </div>

      {(offset > 0 || truncated || total > offset + hits.length) && (
        <div className="flex shrink-0 items-center gap-2 border-t border-line px-2 py-1.5">
          <button
            type="button"
            disabled={busy || offset <= 0}
            onClick={() => void runSearch(Math.max(0, offset - pageSize))}
            className="rounded-md border border-line px-2 py-1 text-[11px] hover:bg-hover disabled:opacity-40"
          >
            Prev
          </button>
          <span className="min-w-0 flex-1 truncate text-center font-mono text-[10px] text-muted">
            {offset + 1}–{offset + hits.length} of {total}
            {truncated ? "+" : ""}
          </span>
          <button
            type="button"
            disabled={busy || offset + hits.length >= total}
            onClick={() => void runSearch(offset + pageSize)}
            className="rounded-md border border-line px-2 py-1 text-[11px] hover:bg-hover disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
