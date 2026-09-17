import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { GitCommit, GitFile, GitStatus } from "@/types/git";
import { getWorkspaceRoot } from "./workspace";

export type { GitCommit, GitFile, GitStatus };

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      timeout: 120_000,
      windowsHide: true,
      maxBuffer: 4_000_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return { ok: true as const, stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const message = [err.stderr, err.stdout, err.message].filter(Boolean).join("\n").trim();
    return { ok: false as const, stdout: err.stdout ?? "", stderr: message };
  }
}

function parseLog(stdout: string): GitCommit[] {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, short, author, date, ...subject] = line.split("\t");
      return { hash, short, author, date, subject: subject.join("\t") };
    });
}

const LOG_FMT = ["--pretty=format:%H%x09%h%x09%an%x09%ad%x09%s", "--date=iso-strict"] as const;

async function unpushedCommits(cwd: string): Promise<GitCommit[]> {
  const upstream = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
  const range = upstream.ok ? `${upstream.stdout.trim()}..HEAD` : "origin/HEAD..HEAD";
  const result = await git(["log", range, ...LOG_FMT], cwd);
  if (result.ok) return parseLog(result.stdout);
  const fallback = await git(["log", "origin/main..HEAD", ...LOG_FMT], cwd);
  if (fallback.ok) return parseLog(fallback.stdout);
  return [];
}

function labelFor(index: string, worktree: string) {
  if (index === "?" && worktree === "?") return "untracked";
  if (index === "A" || worktree === "A") return "added";
  if (index === "D" || worktree === "D") return "deleted";
  if (index === "R" || worktree === "R") return "renamed";
  if (index === "M" || worktree === "M") return "modified";
  if (index === "U" || worktree === "U") return "conflict";
  return `${index}${worktree}`.trim() || "changed";
}

function isStaged(index: string) {
  return index !== "." && index !== "?" && index !== " ";
}

function isUnstaged(index: string, worktree: string) {
  if (index === "?" && worktree === "?") return true;
  return worktree !== "." && worktree !== " ";
}

export async function gitStatus(): Promise<GitStatus> {
  const cwd = await getWorkspaceRoot();
  const inside = await git(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return {
      isRepo: false,
      branch: "",
      upstream: null,
      ahead: 0,
      behind: 0,
      remote: null,
      files: [],
      unpushed: [],
    };
  }

  const [sb, remote] = await Promise.all([
    git(["status", "-sb", "--untracked-files=all"], cwd),
    git(["remote", "get-url", "origin"], cwd),
  ]);

  const lines = sb.stdout.split(/\r?\n/).filter(Boolean);
  const header = lines[0] ?? "##";
  const rest = header.replace(/^##\s+/, "");
  const branch = rest.split("...")[0]?.trim() || "HEAD";
  const upstream = rest.includes("...") ? rest.split("...")[1]?.split(" ")[0] ?? null : null;
  const ahead = Number(/ahead (\d+)/.exec(header)?.[1] ?? 0);
  const behind = Number(/behind (\d+)/.exec(header)?.[1] ?? 0);

  const files: GitFile[] = [];
  for (const line of lines.slice(1)) {
    if (line.length < 4) continue;
    const index = line[0] === " " ? "." : line[0];
    const worktree = line[1] === " " ? "." : line[1];
    const raw = line.slice(3);
    const filePath = raw.includes(" -> ") ? raw.split(" -> ").pop()! : raw;
    files.push({
      path: filePath,
      index,
      worktree,
      label: labelFor(index, worktree),
      staged: isStaged(index),
      unstaged: isUnstaged(index, worktree),
    });
  }

  const unpushed = await unpushedCommits(cwd);
  const aheadCount = ahead || unpushed.length;

  return {
    isRepo: true,
    branch,
    upstream,
    ahead: aheadCount,
    behind,
    remote: remote.ok ? remote.stdout.trim() : null,
    files,
    unpushed,
  };
}

export async function gitLog(limit = 40): Promise<GitCommit[]> {
  const cwd = await getWorkspaceRoot();
  const result = await git(
    ["log", `-n`, String(limit), "--pretty=format:%H%x09%h%x09%an%x09%ad%x09%s", "--date=iso-strict"],
    cwd,
  );
  if (!result.ok) return [];
  return parseLog(result.stdout);
}

export async function gitCommitAndPush(message: string) {
  const commit = await gitCommit(message);
  if (!commit.ok) return commit;
  const push = await gitPush();
  return {
    ok: push.ok,
    stdout: [commit.stdout, push.stdout].filter(Boolean).join("\n"),
    stderr: [commit.stderr, push.stderr].filter(Boolean).join("\n"),
  };
}

export async function gitInit() {
  const cwd = await getWorkspaceRoot();
  return git(["init"], cwd);
}

export async function gitCommit(message: string) {
  const cwd = await getWorkspaceRoot();
  // Commit only what is already staged. Callers stage files explicitly so a
  // half-finished edit is never silently swept into the commit.
  const staged = await git(["diff", "--cached", "--name-only"], cwd);
  if (!staged.ok) return staged;
  if (!staged.stdout.trim()) {
    return { ok: false as const, stdout: "", stderr: "Nothing staged. Stage files before committing." };
  }
  return git(["commit", "-m", message], cwd);
}

export async function gitStage(paths: string[]) {
  const cwd = await getWorkspaceRoot();
  if (paths.length === 0) return { ok: false as const, stdout: "", stderr: "No paths to stage" };
  return git(["add", "--", ...paths], cwd);
}

export async function gitUnstage(paths: string[]) {
  const cwd = await getWorkspaceRoot();
  if (paths.length === 0) return { ok: false as const, stdout: "", stderr: "No paths to unstage" };
  // `restore --staged` works on modern git; fall back to `reset HEAD` for older ones.
  const restore = await git(["restore", "--staged", "--", ...paths], cwd);
  if (restore.ok) return restore;
  return git(["reset", "HEAD", "--", ...paths], cwd);
}

/** Drop local changes. Untracked paths are deleted; tracked paths reset to HEAD. */
export async function gitDiscard(paths: string[]) {
  if (!paths.length) return { ok: true as const, stdout: "", stderr: "" };
  const cwd = await getWorkspaceRoot();
  const st = await gitStatus();
  const byPath = new Map(st.files.map((f) => [f.path, f]));
  const untracked: string[] = [];
  const tracked: string[] = [];

  for (const p of paths) {
    const f = byPath.get(p);
    // Untracked / new files show as ?? in porcelain and should be cleaned, not restored.
    if (!f || (f.index === "?" && f.worktree === "?") || f.label === "untracked") untracked.push(p);
    else tracked.push(p);
  }

  const parts: string[] = [];
  let ok = true;

  if (tracked.length) {
    let res = await git(
      ["restore", "--source=HEAD", "--staged", "--worktree", "--", ...tracked],
      cwd,
    );
    if (!res.ok) res = await git(["checkout", "HEAD", "--", ...tracked], cwd);
    if (res.stdout) parts.push(res.stdout);
    if (res.stderr) parts.push(res.stderr);
    if (!res.ok) ok = false;
  }

  if (untracked.length) {
    const res = await git(["clean", "-f", "--", ...untracked], cwd);
    if (res.stdout) parts.push(res.stdout);
    if (res.stderr) parts.push(res.stderr);
    if (!res.ok) ok = false;
  }

  return {
    ok,
    stdout: parts.filter(Boolean).join("\n"),
    stderr: ok ? "" : parts.filter(Boolean).join("\n") || "Discard failed",
  };
}

export type GitBranch = {
  name: string;
  current: boolean;
};

export async function gitBranches(): Promise<GitBranch[]> {
  const cwd = await getWorkspaceRoot();
  const res = await git(["branch", "--list", "--format=%(refname:short)\t%(HEAD)"], cwd);
  if (!res.ok) return [];
  return res.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, head] = line.split("\t");
      return { name: name ?? line, current: head === "*" };
    })
    .filter((b) => b.name);
}

export async function gitCheckout(branch: string) {
  const name = branch.trim();
  if (!name) return { ok: false as const, stdout: "", stderr: "Branch name required" };
  const cwd = await getWorkspaceRoot();
  return git(["checkout", name], cwd);
}

export async function gitCreateBranch(name: string) {
  const branch = name.trim();
  if (!branch) return { ok: false as const, stdout: "", stderr: "Branch name required" };
  if (!/^[A-Za-z0-9._/\-]+$/.test(branch)) {
    return { ok: false as const, stdout: "", stderr: "Invalid branch name" };
  }
  const cwd = await getWorkspaceRoot();
  return git(["checkout", "-b", branch], cwd);
}

/**
 * Left = HEAD (or empty for new files). Right = working tree (or empty if deleted).
 * This is the simplest useful view: "what does disk look like vs the last commit".
 */
export async function gitFileDiff(relPath: string) {
  const cwd = await getWorkspaceRoot();
  const posix = relPath.replace(/\\/g, "/");

  const head = await git(["show", `HEAD:${posix}`], cwd);
  let original = head.ok ? head.stdout : "";

  let modified = "";
  let deleted = false;
  try {
    modified = await fs.readFile(path.join(cwd, posix), "utf8");
  } catch {
    deleted = true;
    modified = "";
  }

  const tracked = await git(["ls-files", "--error-unmatch", "--", posix], cwd);
  if (!tracked.ok) original = "";

  return {
    ok: true as const,
    path: posix,
    original,
    modified,
    deleted,
    isNew: !tracked.ok,
  };
}

export async function gitPush() {
  const cwd = await getWorkspaceRoot();
  const upstream = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
  if (upstream.ok) return git(["push"], cwd);
  const origin = await git(["remote", "get-url", "origin"], cwd);
  if (!origin.ok) {
    return {
      ok: false as const,
      stdout: "",
      stderr: "No remote named origin. Add one with: git remote add origin <url>",
    };
  }
  return git(["push", "-u", "origin", "HEAD"], cwd);
}

export async function gitPull() {
  const cwd = await getWorkspaceRoot();
  return git(["pull", "--ff-only"], cwd);
}

export async function gitSetRemote(url: string) {
  const cwd = await getWorkspaceRoot();
  const existing = await git(["remote", "get-url", "origin"], cwd);
  if (existing.ok) return git(["remote", "set-url", "origin", url], cwd);
  return git(["remote", "add", "origin", url], cwd);
}
