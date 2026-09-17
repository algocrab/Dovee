"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  GitBranch,
  Link2,
  List,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { GitCommit, GitFile, GitStatus } from "@/types/git";
import { useIde } from "@/stores/ide-store";
import { IconButton } from "./chrome";
import { FileGlyph } from "./file-icon";
import { openFile } from "./file-tree";

type MenuId = "more" | "commit" | null;

function splitFilePath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const i = normalized.lastIndexOf("/");
  if (i < 0) return { name: normalized, dir: "" };
  return { name: normalized.slice(i + 1), dir: normalized.slice(0, i) };
}

function statusLetter(label: string) {
  if (label === "untracked") return "U";
  if (label === "modified") return "M";
  if (label === "added") return "A";
  if (label === "deleted") return "D";
  if (label === "renamed") return "R";
  if (label === "conflict") return "C";
  return "M";
}

function letterClass(letter: string) {
  if (letter === "U" || letter === "A") return "text-green";
  if (letter === "D" || letter === "C") return "text-rose";
  if (letter === "R") return "text-gold";
  return "text-muted";
}

function suggestCommitMessage(files: GitFile[]) {
  if (files.length === 0) return "";
  const names = files.map((file) => splitFilePath(file.path).name);
  if (files.length === 1) {
    const file = files[0]!;
    const name = names[0] ?? file.path;
    if (file.label === "untracked" || file.label === "added") return `Add ${name}`;
    if (file.label === "deleted") return `Remove ${name}`;
    if (file.label === "renamed") return `Rename ${name}`;
    return `Update ${name}`;
  }
  const extra = files.length - 1;
  const allNew = files.every((file) => file.label === "untracked" || file.label === "added");
  const allDel = files.every((file) => file.label === "deleted");
  if (allNew) return `Add ${names[0]} and ${extra} more`;
  if (allDel) return `Remove ${names[0]} and ${extra} more`;
  return extra === 1 ? `Update ${names[0]} and ${names[1]}` : `Update ${names[0]} and ${extra} more`;
}

export function GitPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [message, setMessage] = useState("");
  const [remote, setRemote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [logOk, setLogOk] = useState<boolean | null>(null);
  const [menu, setMenu] = useState<MenuId>(null);
  const [showRemote, setShowRemote] = useState(false);
  const [openChanges, setOpenChanges] = useState(true);
  const [openHistory, setOpenHistory] = useState(true);
  const [showDir, setShowDir] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const applyStatus = useCallback((st: GitStatus & { error?: string }) => {
    if (st.error) {
      setLog(st.error);
      setLogOk(false);
      return;
    }
    setStatus(st);
    useIde.getState().setGitBranch(st.isRepo ? st.branch : "");
    setRemote(st.remote ?? "");
    if (!st.remote) setShowRemote(true);
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

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function run(action: string, extra?: Record<string, string>) {
    setBusy(action);
    setLog("");
    setLogOk(null);
    setMenu(null);
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
      if (action === "remote" && data.ok) setShowRemote(false);
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
  const files = status?.files ?? [];
  const canCommit = Boolean(message.trim()) && files.length > 0 && busy === null;
  const working = busy !== null;

  function commit(kind: "commit" | "commit-push") {
    if (!message.trim()) return;
    void run(kind, { message: message.trim() });
  }

  return (
    <div ref={rootRef} className="relative flex h-full flex-col">
      <header className="flex h-8 shrink-0 items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Changes
        </span>
        <IconButton
          title={showDir ? "Hide file paths" : "Show file paths"}
          className="p-1"
          active={showDir}
          onClick={() => setShowDir((v) => !v)}
        >
          <List className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          title="All changes are included in the commit"
          className="p-1"
          onClick={() => messageRef.current?.focus()}
        >
          <Check className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Refresh" className="p-1" onClick={() => void load()}>
          <RefreshCw className={cn("h-3.5 w-3.5", working && "animate-spin")} />
        </IconButton>
        <div className="relative">
          <IconButton title="More actions" className="p-1" active={menu === "more"} onClick={() => setMenu(menu === "more" ? null : "more")}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </IconButton>
          {menu === "more" && (
            <Menu>
              <MenuItem
                onClick={() => {
                  setShowRemote((v) => !v);
                  setMenu(null);
                }}
              >
                {connected ? "Edit remote" : "Connect repo"}
              </MenuItem>
              <MenuItem disabled={working || !connected} onClick={() => void run("push")}>
                {busy === "push" ? "Pushing…" : ahead > 0 ? `Push ${ahead} commit${ahead === 1 ? "" : "s"}` : "Push"}
              </MenuItem>
              <MenuItem disabled={working || !connected} onClick={() => void run("pull")}>
                {busy === "pull" ? "Pulling…" : "Pull"}
              </MenuItem>
              <MenuItem onClick={() => setOpenHistory((v) => !v)}>{openHistory ? "Hide history" : "Show history"}</MenuItem>
            </Menu>
          )}
        </div>
      </header>

      {showRemote && (
        <form
          className="border-b border-line px-2 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (remote.trim()) void run("remote", { url: remote.trim() });
          }}
        >
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
            <Link2 className="h-3 w-3" />
            {connected ? "Remote" : "Connect repo"}
          </div>
          {connected && status?.remote && (
            <a
              href={status.remote}
              target="_blank"
              rel="noreferrer"
              className="mb-1 block truncate font-mono text-[11px] text-teal hover:underline"
              title={status.remote}
            >
              {status.remote.replace(/^https?:\/\//, "")}
            </a>
          )}
          <div className="flex gap-1">
            <input
              value={remote}
              onChange={(e) => setRemote(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 font-mono text-[11px] outline-none"
            />
            <button
              type="submit"
              disabled={working || !remote.trim()}
              className="shrink-0 rounded-md bg-teal/15 px-2 py-1 text-[11px] text-teal disabled:opacity-40"
            >
              {connected ? "Update" : "Connect"}
            </button>
          </div>
        </form>
      )}

      {status && !status.isRepo && (
        <div className="px-3 py-3">
          <p className="text-xs text-muted">This folder is not a git repository.</p>
          <button
            type="button"
            disabled={working}
            onClick={() => void run("init")}
            className="mt-3 w-full rounded-md bg-teal/15 px-2 py-1.5 text-xs text-teal"
          >
            Initialize repository
          </button>
        </div>
      )}

      {status?.isRepo && (
        <>
          <div className="px-2 pb-2">
            <div className="relative">
              <textarea
                ref={messageRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canCommit) {
                    e.preventDefault();
                    commit("commit");
                  }
                }}
                placeholder="Message (Ctrl+Enter to commit)"
                rows={2}
                className="w-full resize-none rounded-md border border-line bg-bg py-1.5 pr-8 pl-2 text-[12px] outline-none placeholder:text-muted/80"
              />
              <button
                type="button"
                title="Generate commit message"
                disabled={files.length === 0}
                onClick={() => {
                  setMessage(suggestCommitMessage(files));
                  messageRef.current?.focus();
                }}
                className="absolute top-1.5 right-1.5 rounded-md p-1 text-muted hover:bg-hover hover:text-teal disabled:opacity-30"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="relative mt-1.5 flex">
              <button
                type="button"
                disabled={!canCommit}
                onClick={() => commit("commit")}
                className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-l-md bg-teal text-[12px] font-medium text-bg disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                {busy === "commit" ? "Committing…" : "Commit"}
              </button>
              <button
                type="button"
                title="Commit options"
                disabled={working}
                onClick={() => setMenu(menu === "commit" ? null : "commit")}
                className="flex h-8 w-7 items-center justify-center rounded-r-md border-l border-bg/25 bg-teal text-bg disabled:opacity-40"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {menu === "commit" && (
                <Menu className="right-0 left-0 w-auto">
                  <MenuItem disabled={!canCommit} onClick={() => commit("commit")}>
                    Commit
                  </MenuItem>
                  <MenuItem
                    disabled={!canCommit || !connected}
                    onClick={() => commit("commit-push")}
                    title={connected ? "Commit and push to GitHub" : "Connect a repo first"}
                  >
                    {busy === "commit-push" ? "Pushing…" : "Commit & Push"}
                  </MenuItem>
                  <MenuItem disabled={working || !connected} onClick={() => void run("push")}>
                    Push
                  </MenuItem>
                  <MenuItem disabled={working || !connected} onClick={() => void run("pull")}>
                    Pull
                  </MenuItem>
                </Menu>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <Section
              open={openChanges}
              onToggle={() => setOpenChanges((v) => !v)}
              title="Changes"
              count={files.length}
            >
              {files.length === 0 && <p className="px-3 py-2 text-[11px] text-muted">Working tree clean.</p>}
              {files.map((file) => {
                const { name, dir } = splitFilePath(file.path);
                const letter = statusLetter(file.label);
                return (
                  <button
                    key={file.path}
                    type="button"
                    title={file.path}
                    onClick={() => void openFile(file.path)}
                    className="flex w-full items-center gap-1.5 py-0.5 pr-2 pl-2 text-left hover:bg-hover"
                  >
                    <FileGlyph name={name} />
                    <span className="min-w-0 flex-1 truncate text-[12px]">
                      {name}
                      {showDir && dir ? <span className="ml-1.5 text-[11px] text-muted">{dir}</span> : null}
                    </span>
                    <span className={cn("w-3 shrink-0 text-center font-mono text-[11px] font-medium", letterClass(letter))}>
                      {letter}
                    </span>
                  </button>
                );
              })}
            </Section>

            <Section open={openHistory} onToggle={() => setOpenHistory((v) => !v)} title="History" count={commits.length}>
              {status.branch && (
                <div className="flex items-center gap-1.5 px-3 py-1 font-mono text-[11px] text-muted">
                  <GitBranch className="h-3 w-3 text-teal" />
                  <span className="truncate text-teal/90">{status.branch}</span>
                  {ahead > 0 && <span className="text-gold">↑{ahead}</span>}
                  {!!status.behind && <span className="text-rose">↓{status.behind}</span>}
                </div>
              )}
              {commits.length === 0 && <p className="px-3 py-2 text-[11px] text-muted">No commits yet.</p>}
              <ol className="relative ml-3 border-l border-line pb-2">
                {commits.map((commitItem, i) => (
                  <li key={commitItem.hash} className="relative py-1.5 pl-4 pr-2">
                    <span
                      className={cn(
                        "absolute top-2.5 -left-[5px] h-2.5 w-2.5 rounded-full",
                        i === 0 ? "bg-teal" : "border border-muted bg-bg-1",
                      )}
                    />
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 truncate text-[12px] leading-snug">{commitItem.subject}</p>
                      {i === 0 && (
                        <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full bg-teal/15 px-1.5 py-0.5 font-mono text-[10px] text-teal">
                          {status.branch || "HEAD"}
                          {ahead > 0 && <Cloud className="h-3 w-3" />}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[10px] text-muted">
                      {commitItem.author}
                      {commitItem.date ? ` · ${commitItem.date.slice(0, 10)}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </Section>
          </div>
        </>
      )}

      {log && (
        <pre
          className={cn(
            "mx-2 mb-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-md border px-2 py-1.5 font-mono text-[10px]",
            logOk === false ? "border-rose/30 bg-rose/10 text-rose" : "border-green/30 bg-green/10 text-green",
          )}
        >
          {log}
        </pre>
      )}
    </div>
  );
}

function Section({
  open,
  onToggle,
  title,
  count,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-1 px-2 py-1 text-muted hover:text-text">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="text-[11px]">{title}</span>
        {count ? <span className="ml-auto font-mono text-[11px]">{count}</span> : null}
      </button>
      {open ? children : null}
    </section>
  );
}

function Menu({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "absolute top-full right-0 z-30 mt-1 min-w-[180px] rounded-md border border-line bg-bg-2 py-1 shadow-[var(--shadow)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex w-full px-3 py-1.5 text-left text-[12px] text-text hover:bg-hover disabled:opacity-40"
    >
      {children}
    </button>
  );
}
