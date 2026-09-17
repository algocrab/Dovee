"use client";

import { GitBranch, Link2, RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { GitCommit, GitStatus } from "@/types/git";
import { useIde } from "@/stores/ide-store";
import { IconButton, PanelHeading } from "./chrome";
import { openFile } from "./file-tree";

export function GitPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [tab, setTab] = useState<"changes" | "history">("changes");
  const [message, setMessage] = useState("");
  const [remote, setRemote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [logOk, setLogOk] = useState<boolean | null>(null);

  const applyStatus = useCallback((st: GitStatus & { error?: string }) => {
    if (st.error) {
      setLog(st.error);
      setLogOk(false);
      return;
    }
    setStatus(st);
    useIde.getState().setGitBranch(st.isRepo ? st.branch : "");
    setRemote(st.remote ?? "");
  }, []);

  const load = useCallback(async () => {
    const [st, hist] = await Promise.all([
      fetch("/api/git").then((r) => r.json()) as Promise<GitStatus & { error?: string }>,
      fetch("/api/git?view=log").then((r) => r.json()) as Promise<{ commits?: GitCommit[] }>,
    ]);
    applyStatus(st);
    setCommits(hist.commits ?? []);
  }, [applyStatus]);

  useEffect(() => {
    fetch("/api/git")
      .then((r) => r.json())
      .then((st: GitStatus & { error?: string }) => applyStatus(st))
      .catch((error: unknown) => {
        setLog(error instanceof Error ? error.message : String(error));
        setLogOk(false);
      });
    fetch("/api/git?view=log")
      .then((r) => r.json())
      .then((hist: { commits?: GitCommit[] }) => setCommits(hist.commits ?? []))
      .catch(() => setCommits([]));
  }, [applyStatus]);

  async function run(action: string, extra?: Record<string, string>) {
    setBusy(action);
    setLog("");
    setLogOk(null);
    try {
      const res = await fetch("/api/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = (await res.json()) as { ok?: boolean; stdout?: string; stderr?: string };
      const text = [data.stdout, data.stderr].filter(Boolean).join("\n").trim();
      setLogOk(Boolean(data.ok));
      if (data.ok) {
        setLog(text || (action === "push" || action === "commit-push" ? "Pushed to GitHub." : "Done."));
      } else {
        setLog(text || "Failed.");
      }
      if ((action === "commit" || action === "commit-push") && data.ok) setMessage("");
      await load();
    } catch (error) {
      setLogOk(false);
      setLog(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const connected = Boolean(status?.remote);
  const ahead = status?.ahead ?? 0;

  return (
    <div className="flex h-full flex-col">
      <Header onRefresh={() => void load()} />

      <div className="border-b border-line px-3 pb-3">
        <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
          <Link2 className="h-3 w-3" />
          {connected ? "Connected repo" : "Connect repo"}
        </div>
        {connected && (
          <a
            href={status?.remote ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="mb-1.5 block truncate font-mono text-[11px] text-teal hover:underline"
            title={status?.remote ?? ""}
          >
            {status?.remote?.replace(/^https?:\/\//, "")}
          </a>
        )}
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (remote.trim()) void run("remote", { url: remote.trim() });
          }}
        >
          <input
            value={remote}
            onChange={(e) => setRemote(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-[11px] outline-none focus:border-teal/40"
          />
          <button
            type="submit"
            disabled={busy !== null || !remote.trim()}
            className="shrink-0 rounded-md bg-teal/15 px-2 py-1.5 text-[11px] text-teal disabled:opacity-40"
          >
            {connected ? "Update" : "Connect"}
          </button>
        </form>
        {!connected && (
          <p className="mt-1.5 text-[10px] leading-snug text-muted">
            Paste your GitHub repo URL, then Connect. Commit is local until you Push.
          </p>
        )}
      </div>

      {status && !status.isRepo && (
        <div className="px-3 py-3">
          <p className="text-xs text-muted">This folder is not a git repository.</p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("init")}
            className="mt-3 w-full rounded-md bg-teal/15 px-2 py-1.5 text-xs text-teal"
          >
            Initialize repository
          </button>
        </div>
      )}

      {status?.isRepo && (
        <>
          {ahead > 0 && (
            <div className="mx-2 mt-2 rounded-md border border-gold/30 bg-gold/10 px-2 py-2">
              <p className="text-[11px] text-gold">
                {ahead} local commit{ahead === 1 ? "" : "s"} not on GitHub
              </p>
              {(status.unpushed ?? []).slice(0, 4).map((c) => (
                <p key={c.hash} className="truncate font-mono text-[10px] text-muted">
                  {c.short} {c.subject}
                </p>
              ))}
              <button
                type="button"
                disabled={busy !== null || !connected}
                onClick={() => void run("push")}
                className="mt-2 w-full rounded-md bg-gold/20 py-1.5 text-[11px] text-gold disabled:opacity-40"
              >
                {busy === "push" ? "Pushing…" : `Push to ${connected ? "GitHub" : "remote"}`}
              </button>
              {!connected && <p className="mt-1 text-[10px] text-rose">Connect a repo URL first.</p>}
            </div>
          )}

          <div className="flex items-center gap-1 px-2 py-2">
            <button
              type="button"
              onClick={() => setTab("changes")}
              className={cn("rounded px-2 py-1 text-[11px]", tab === "changes" ? "bg-hover text-text" : "text-muted")}
            >
              Changes{status.files.length ? ` (${status.files.length})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className={cn("rounded px-2 py-1 text-[11px]", tab === "history" ? "bg-hover text-text" : "text-muted")}
            >
              History
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
            {tab === "changes" ? (
              <div className="space-y-1">
                <div className="mb-2 flex items-center gap-1.5 px-1 font-mono text-[11px] text-teal/80">
                  <GitBranch className="h-3 w-3" />
                  <span className="truncate">{status.branch || "—"}</span>
                  {ahead > 0 && <span className="text-gold">↑{ahead}</span>}
                  {!!status.behind && <span className="text-rose">↓{status.behind}</span>}
                </div>
                {status.files.length === 0 && <p className="px-1 text-[11px] text-muted">Working tree clean.</p>}
                {status.files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => void openFile(file.path)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-hover"
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
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={!message.trim() || busy !== null}
                  onClick={() => void run("commit", { message: message.trim() })}
                  className="rounded-md border border-line py-1.5 text-[11px] text-muted hover:text-text disabled:opacity-40"
                >
                  {busy === "commit" ? "Committing…" : "Commit local"}
                </button>
                <button
                  type="button"
                  disabled={!message.trim() || busy !== null || !connected}
                  onClick={() => void run("commit-push", { message: message.trim() })}
                  className="rounded-md bg-teal/20 py-1.5 text-[11px] text-teal disabled:opacity-40"
                  title={connected ? "Commit and push to GitHub" : "Connect a repo first"}
                >
                  {busy === "commit-push" ? "Pushing…" : "Commit & Push"}
                </button>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={busy !== null || !connected}
                  onClick={() => void run("push")}
                  className="rounded-md bg-gold/15 py-1.5 text-[11px] text-gold disabled:opacity-40"
                >
                  <Upload className="mr-1 inline h-3 w-3" />
                  {busy === "push" ? "Pushing…" : "Push"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null || !connected}
                  onClick={() => void run("pull")}
                  className="rounded-md border border-line py-1.5 text-[11px] text-muted hover:text-text disabled:opacity-40"
                >
                  {busy === "pull" ? "Pulling…" : "Pull"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {log && (
        <pre
          className={cn(
            "mx-2 mb-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-md border px-2 py-1.5 font-mono text-[10px]",
            logOk === false ? "border-rose/30 bg-rose/10 text-rose" : "border-green/30 bg-green/10 text-green",
          )}
        >
          {log}
        </pre>
      )}
    </div>
  );
}

function Header({ onRefresh }: { onRefresh: () => void }) {
  return (
    <PanelHeading
      kicker="Source control"
      title="Git"
      actions={
        <IconButton title="Refresh" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
        </IconButton>
      }
    />
  );
}
