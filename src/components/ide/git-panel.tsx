"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  GitBranch,
  Link2,
  List,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { languageFromPath } from "@/lib/ignore";
import type { GitCommit, GitFile, GitStatus } from "@/types/git";
import { useIde } from "@/stores/ide-store";
import { IconButton } from "./chrome";
import { FileGlyph } from "./file-icon";
import { openFile } from "./file-tree";

type MenuId = "more" | "commit" | "branch" | null;

type GitBranchInfo = { name: string; current: boolean };

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
    const file = files[0];
    if (!file) return "";
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

async function openDiff(filePath: string) {
  try {
    const res = await fetch(`/api/git?view=diff&path=${encodeURIComponent(filePath)}`);
    const data = (await res.json()) as {
      ok?: boolean;
      path?: string;
      original?: string;
      modified?: string;
      error?: string;
    };
    if (!data.ok || !data.path) {
      useIde.getState().setStatus(data.error || "Could not load diff");
      return;
    }
    const virtual = `diff://${data.path}`;
    useIde.getState().openTab({
      path: virtual,
      sourcePath: data.path,
      kind: "diff",
      content: data.modified ?? "",
      original: data.original ?? "",
      language: languageFromPath(data.path),
    });
  } catch (error) {
    useIde.getState().setStatus(error instanceof Error ? error.message : String(error));
  }
}

export function GitPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [message, setMessage] = useState("");
  const [remote, setRemote] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [logOk, setLogOk] = useState<boolean | null>(null);
  const [menu, setMenu] = useState<MenuId>(null);
  const [showRemote, setShowRemote] = useState(false);
  const [openStaged, setOpenStaged] = useState(true);
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
    const [st, hist, br] = await Promise.all([
      fetch("/api/git").then((r) => r.json()) as Promise<GitStatus & { error?: string }>,
      fetch("/api/git?view=log").then((r) => r.json()) as Promise<{ commits?: GitCommit[] }>,
      fetch("/api/git?view=branches").then((r) => r.json()) as Promise<{ branches?: GitBranchInfo[] }>,
    ]);
    applyStatus(st);
    setCommits(hist.commits ?? []);
    setBranches(br.branches ?? []);
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
    fetch("/api/git?view=branches")
      .then((r) => r.json())
      .then((br: { branches?: GitBranchInfo[] }) => setBranches(br.branches ?? []))
      .catch(() => setBranches([]));
  }, [applyStatus]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function run(action: string, extra?: Record<string, unknown>) {
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

  async function discardPaths(paths: string[]) {
    if (!paths.length || busy !== null) return;
    const label = paths.length === 1 ? paths[0] : `${paths.length} files`;
    if (!window.confirm(`Discard local changes in ${label}? This cannot be undone.`)) return;
    await run("discard", { paths });
    for (const p of paths) {
      try {
        const res = await fetch(`/api/files/read?path=${encodeURIComponent(p)}`);
        if (!res.ok) continue;
        const data = (await res.json()) as { content?: string };
        if (typeof data.content === "string") useIde.getState().reloadTab(p, data.content);
      } catch {
        /* ignore */
      }
    }
  }

  async function switchBranch(name: string) {
    if (!name || busy !== null) return;
    await run("checkout", { branch: name });
  }

  async function createBranch() {
    const name = newBranch.trim();
    if (!name || busy !== null) return;
    await run("create-branch", { branch: name });
    setNewBranch("");
  }

  const connected = Boolean(status?.remote);
  const ahead = status?.ahead ?? 0;
  const files = status?.files ?? [];
  const staged = files.filter((f) => f.staged);
  const unstaged = files.filter((f) => f.unstaged);
  const canCommit = Boolean(message.trim()) && staged.length > 0 && busy === null;
  const working = busy !== null;

  function commit(kind: "commit" | "commit-push") {
    if (!message.trim() || staged.length === 0) return;
    void run(kind, { message: message.trim() });
  }

  function FileRow({
    file,
    action,
    canDiscard,
  }: {
    file: GitFile;
    action: "stage" | "unstage";
    canDiscard?: boolean;
  }) {
    const { name, dir } = splitFilePath(file.path);
    const letter = statusLetter(file.label);
    return (
      <div className="group flex w-full items-center gap-1 py-0.5 pr-1 pl-2 hover:bg-hover">
        <button
          type="button"
          title={file.path}
          onClick={() => void openDiff(file.path)}
          onDoubleClick={() => void openFile(file.path)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
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
        {canDiscard ? (
          <button
            type="button"
            title="Discard changes"
            disabled={working}
            onClick={(e) => {
              e.stopPropagation();
              void discardPaths([file.path]);
            }}
            className="shrink-0 rounded p-0.5 text-muted opacity-0 hover:bg-bg-2 hover:text-rose group-hover:opacity-100 disabled:opacity-30"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          title={action === "stage" ? "Stage" : "Unstage"}
          disabled={working}
          onClick={(e) => {
            e.stopPropagation();
            void run(action, { paths: [file.path] });
          }}
          className="shrink-0 rounded p-0.5 text-muted opacity-0 hover:bg-bg-2 hover:text-teal group-hover:opacity-100 disabled:opacity-30"
        >
          {action === "stage" ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative flex h-full flex-col">
      <header className="flex h-8 shrink-0 items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Changes
        </span>
        {status?.isRepo ? (
          <div className="relative">
            <IconButton
              title={`Branch: ${status.branch || "unknown"}`}
              className="max-w-[9rem] gap-1 px-1.5 py-1"
              active={menu === "branch"}
              onClick={() => setMenu(menu === "branch" ? null : "branch")}
            >
              <GitBranch className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate text-[11px] normal-case tracking-normal">
                {status.branch || "branch"}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
            </IconButton>
            {menu === "branch" && (
              <Menu className="w-56">
                <div className="border-b border-line px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Local branches
                </div>
                <div className="max-h-48 overflow-auto py-1">
                  {(branches.length ? branches : [{ name: status.branch, current: true }]).map((b) => (
                    <MenuItem
                      key={b.name}
                      disabled={working || b.current || !b.name}
                      onClick={() => void switchBranch(b.name)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", b.current ? "bg-teal" : "bg-transparent")}
                        />
                        <span className="truncate">{b.name}</span>
                        {b.current ? <span className="text-[10px] text-muted">current</span> : null}
                      </span>
                    </MenuItem>
                  ))}
                </div>
                <div className="border-t border-line p-2">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">New branch</div>
                  <div className="flex gap-1">
                    <input
                      value={newBranch}
                      onChange={(e) => setNewBranch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void createBranch();
                      }}
                      placeholder="feature/…"
                      className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 font-mono text-[11px] outline-none"
                    />
                    <button
                      type="button"
                      disabled={working || !newBranch.trim()}
                      onClick={() => void createBranch()}
                      className="rounded-md border border-line px-2 py-1 text-[11px] hover:bg-hover disabled:opacity-40"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </Menu>
            )}
          </div>
        ) : null}
        <IconButton
          title={showDir ? "Hide file paths" : "Show file paths"}
          className="p-1"
          active={showDir}
          onClick={() => setShowDir((v) => !v)}
        >
          <List className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          title={unstaged.length ? "Stage all changes" : "Nothing to stage"}
          className={cn("p-1", (working || unstaged.length === 0) && "pointer-events-none opacity-40")}
          onClick={() => {
            if (working || unstaged.length === 0) return;
            void run("stage", { paths: unstaged.map((f) => f.path) });
          }}
        >
          <Check className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          title={unstaged.length ? "Discard all unstaged changes" : "Nothing to discard"}
          className={cn("p-1", (working || unstaged.length === 0) && "pointer-events-none opacity-40")}
          onClick={() => {
            if (working || unstaged.length === 0) return;
            void discardPaths(unstaged.map((f) => f.path));
          }}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Refresh" className="p-1" onClick={() => void load()}>
          <RefreshCw className={cn("h-3.5 w-3.5", working && "animate-spin")} />
        </IconButton>
        <div className="relative">
          <IconButton
            title="More actions"
            className="p-1"
            active={menu === "more"}
            onClick={() => setMenu(menu === "more" ? null : "more")}
          >
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
              <MenuItem onClick={() => setOpenHistory((v) => !v)}>
                {openHistory ? "Hide history" : "Show history"}
              </MenuItem>
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
            >
              {status.remote}
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
              className="rounded-md border border-line px-2 py-1 text-[11px] hover:bg-hover disabled:opacity-40"
            >
              {connected ? "Save" : "Connect"}
            </button>
          </div>
        </form>
      )}

      {!status ? (
        <div className="flex flex-1 items-center justify-center text-[12px] text-muted">Loading…</div>
      ) : !status.isRepo ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <GitBranch className="h-8 w-8 text-muted" />
          <p className="text-[13px] text-muted">This folder is not a git repository.</p>
          <button
            type="button"
            disabled={working}
            onClick={() => void run("init")}
            className="rounded-md border border-line px-3 py-1.5 text-[12px] hover:bg-hover disabled:opacity-40"
          >
            {busy === "init" ? "Initializing…" : "Initialize repository"}
          </button>
        </div>
      ) : (
        <>
          <div className="border-b border-line px-2 pb-2">
            {status.branch && (
              <div className="mb-1.5 flex items-center gap-1.5 px-1 font-mono text-[11px] text-muted">
                <GitBranch className="h-3 w-3 text-teal" />
                <span className="truncate text-teal/90">{status.branch}</span>
                {ahead > 0 && <span className="text-gold">↑{ahead}</span>}
                {!!status.behind && <span className="text-rose">↓{status.behind}</span>}
                {connected && (
                  <a
                    href={status.remote ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-muted hover:text-teal"
                    title={status.remote ?? undefined}
                  >
                    <Cloud className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
            <div className="relative">
              <textarea
                ref={messageRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    commit("commit");
                  }
                }}
                rows={3}
                placeholder="Commit message"
                className="w-full resize-none rounded-md border border-line bg-bg px-2 py-1.5 pr-8 text-[12px] outline-none placeholder:text-muted"
              />
              <button
                type="button"
                title="Suggest message"
                disabled={staged.length === 0}
                onClick={() => {
                  setMessage(suggestCommitMessage(staged));
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
                {busy === "commit" ? "Committing…" : staged.length ? `Commit ${staged.length}` : "Commit"}
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
              open={openStaged}
              onToggle={() => setOpenStaged((v) => !v)}
              title="Staged"
              count={staged.length}
              action={
                staged.length > 0 ? (
                  <button
                    type="button"
                    title="Unstage all"
                    disabled={working}
                    onClick={(e) => {
                      e.stopPropagation();
                      void run("unstage", { paths: staged.map((f) => f.path) });
                    }}
                    className="rounded p-0.5 text-muted hover:bg-hover hover:text-text disabled:opacity-40"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                ) : null
              }
            >
              {staged.length === 0 && <p className="px-3 py-2 text-[11px] text-muted">No staged changes.</p>}
              {staged.map((file) => (
                <FileRow key={`s:${file.path}`} file={file} action="unstage" />
              ))}
            </Section>

            <Section
              open={openChanges}
              onToggle={() => setOpenChanges((v) => !v)}
              title="Changes"
              count={unstaged.length}
              action={
                unstaged.length > 0 ? (
                  <span className="flex items-center gap-0.5">
                    <button
                      type="button"
                      title="Discard all"
                      disabled={working}
                      onClick={(e) => {
                        e.stopPropagation();
                        void discardPaths(unstaged.map((f) => f.path));
                      }}
                      className="rounded p-0.5 text-muted hover:bg-hover hover:text-rose disabled:opacity-40"
                    >
                      <Undo2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      title="Stage all"
                      disabled={working}
                      onClick={(e) => {
                        e.stopPropagation();
                        void run("stage", { paths: unstaged.map((f) => f.path) });
                      }}
                      className="rounded p-0.5 text-muted hover:bg-hover hover:text-text disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </span>
                ) : null
              }
            >
              {unstaged.length === 0 && <p className="px-3 py-2 text-[11px] text-muted">Working tree clean.</p>}
              {unstaged.map((file) => (
                <FileRow key={`u:${file.path}`} file={file} action="stage" canDiscard />
              ))}
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
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px]">{commitItem.subject}</div>
                        <div className="mt-0.5 flex gap-2 font-mono text-[10px] text-muted">
                          <span>{commitItem.hash.slice(0, 7)}</span>
                          <span className="truncate">{commitItem.author}</span>
                          <span className="shrink-0">{commitItem.date}</span>
                        </div>
                      </div>
                    </div>
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
            "max-h-24 shrink-0 overflow-auto border-t px-2 py-1.5 font-mono text-[11px] whitespace-pre-wrap",
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
  action,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex w-full items-center gap-1 px-2 py-1 text-muted">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1 hover:text-text">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="text-[11px]">{title}</span>
          {count ? <span className="ml-auto font-mono text-[11px]">{count}</span> : null}
        </button>
        {action}
      </div>
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
