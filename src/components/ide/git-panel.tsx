"use client";

import { GitBranch, History, RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { GitCommit, GitStatus } from "@/types/git";
import { useIde } from "@/stores/ide-store";
import { openFile } from "./file-tree";

export function GitPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [tab, setTab] = useState<"changes" | "history">("changes");
  const [message, setMessage] = useState("");
  const [remote, setRemote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState("");

  const load = useCallback(async () => {
    const [st, hist] = await Promise.all([
      fetch("/api/git").then((r) => r.json()) as Promise<GitStatus & { error?: string }>,
      fetch("/api/git?view=log").then((r) => r.json()) as Promise<{ commits?: GitCommit[] }>,
    ]);
    if (!st.error) {
      setStatus(st);
      useIde.getState().setGitBranch(st.isRepo ? st.branch : "");
      if (st.remote) setRemote(st.remote);
    } else {
      setLog(st.error);
    }
    setCommits(hist.commits ?? []);
  }, []);

  useEffect(() => {
    fetch("/api/git")
      .then((r) => r.json())
      .then((st: GitStatus & { error?: string }) => {
        if (st.error) {
          setLog(st.error);
          return;
        }
        setStatus(st);
        useIde.getState().setGitBranch(st.isRepo ? st.branch : "");
        if (st.remote) setRemote(st.remote);
      })
      .catch((error: unknown) => setLog(error instanceof Error ? error.message : String(error)));
    fetch("/api/git?view=log")
      .then((r) => r.json())
      .then((hist: { commits?: GitCommit[] }) => setCommits(hist.commits ?? []))
      .catch(() => setCommits([]));
  }, []);

  async function run(action: string, extra?: Record<string, string>) {
    setBusy(action);
    setLog("");
    try {
      const res = await fetch("/api/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = (await res.json()) as { ok?: boolean; stdout?: string; stderr?: string };
      const text = [data.stdout, data.stderr].filter(Boolean).join("\n").trim();
      setLog(text || (data.ok ? "Done." : "Failed."));
      if (action === "commit" && data.ok) setMessage("");
      await load();
    } catch (error) {
      setLog(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  if (status && !status.isRepo) {
    return (
      <div className="flex h-full flex-col px-3 py-2">
        <Header onRefresh={() => void load()} />
        <p className="mt-4 text-xs text-muted">This folder is not a git repository.</p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("init")}
          className="mt-3 rounded-md bg-teal/15 px-2 py-1.5 text-xs text-teal"
        >
          Initialize repository
        </button>
        {log && <pre className="mt-3 whitespace-pre-wrap font-mono text-[10px] text-muted">{log}</pre>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header onRefresh={() => void load()} />
      <div className="flex items-center gap-1 px-2 pb-2">
        <button
          type="button"
          onClick={() => setTab("changes")}
          className={cn("rounded px-2 py-1 text-[11px]", tab === "changes" ? "bg-white/10 text-text" : "text-muted")}
        >
          Changes{status?.files.length ? ` (${status.files.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={cn("rounded px-2 py-1 text-[11px]", tab === "history" ? "bg-white/10 text-text" : "text-muted")}
        >
          History
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {tab === "changes" ? (
          <div className="space-y-1">
            <div className="mb-2 flex items-center gap-1.5 px-1 font-mono text-[11px] text-teal/80">
              <GitBranch className="h-3 w-3" />
              <span className="truncate">{status?.branch || "—"}</span>
              {!!status?.ahead && <span className="text-gold">↑{status.ahead}</span>}
              {!!status?.behind && <span className="text-rose">↓{status.behind}</span>}
            </div>
            {(status?.files ?? []).length === 0 && (
              <p className="px-1 text-[11px] text-muted">Working tree clean.</p>
            )}
            {(status?.files ?? []).map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => void openFile(file.path)}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-white/5"
              >
                <span className="w-14 shrink-0 font-mono text-[10px] uppercase text-gold">{file.label}</span>
                <span className="min-w-0 truncate font-mono text-[11px]">{file.path}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {commits.length === 0 && <p className="px-1 text-[11px] text-muted">No commits yet.</p>}
            {commits.map((c) => (
              <div key={c.hash} className="rounded-md border border-line/70 px-2 py-1.5">
                <div className="flex items-center gap-2 font-mono text-[10px] text-muted">
                  <span className="text-teal">{c.short}</span>
                  <span className="truncate">{c.date.slice(0, 16).replace("T", " ")}</span>
                </div>
                <div className="mt-0.5 text-[12px] leading-snug">{c.subject}</div>
                <div className="text-[10px] text-muted">{c.author}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {tab === "changes" && (
        <div className="border-t border-line p-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Commit message"
            rows={2}
            className="w-full resize-none rounded-md border border-line bg-bg px-2 py-1.5 text-xs outline-none focus:border-teal/40"
          />
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              disabled={!message.trim() || busy !== null}
              onClick={() => void run("commit", { message: message.trim() })}
              className="flex-1 rounded-md bg-teal/15 py-1.5 text-[11px] text-teal disabled:opacity-40"
            >
              {busy === "commit" ? "Committing…" : "Commit"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run("push")}
              className="rounded-md bg-gold/15 px-2 py-1.5 text-[11px] text-gold disabled:opacity-40"
              title="Push to origin"
            >
              <Upload className="inline h-3 w-3" /> Push
            </button>
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("pull")}
            className="mt-1.5 w-full rounded-md border border-line py-1 text-[11px] text-muted hover:text-text disabled:opacity-40"
          >
            {busy === "pull" ? "Pulling…" : "Pull"}
          </button>
          {!status?.remote && (
            <form
              className="mt-2 flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (remote.trim()) void run("remote", { url: remote.trim() });
              }}
            >
              <input
                value={remote}
                onChange={(e) => setRemote(e.target.value)}
                placeholder="origin URL"
                className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 font-mono text-[10px] outline-none"
              />
              <button type="submit" className="rounded-md bg-white/10 px-2 text-[10px] text-muted">
                Set
              </button>
            </form>
          )}
          {log && <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-muted">{log}</pre>}
        </div>
      )}
    </div>
  );
}

function Header({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div>
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted">Source control</div>
        <div className="flex items-center gap-1 text-[11px] text-teal/80">
          <History className="h-3 w-3" />
          Git
        </div>
      </div>
      <button type="button" onClick={onRefresh} className="rounded p-1 text-muted hover:bg-white/5 hover:text-text" title="Refresh">
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
