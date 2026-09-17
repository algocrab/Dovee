import { execFile } from "node:child_process";
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
    });
    return { ok: true as const, stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const message = [err.stderr, err.stdout, err.message].filter(Boolean).join("\n").trim();
    return { ok: false as const, stdout: err.stdout ?? "", stderr: message };
  }
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

export async function gitStatus(): Promise<GitStatus> {
  const cwd = await getWorkspaceRoot();
  const inside = await git(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return { isRepo: false, branch: "", upstream: null, ahead: 0, behind: 0, remote: null, files: [] };
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
    const path = raw.includes(" -> ") ? raw.split(" -> ").pop()! : raw;
    files.push({
      path,
      index,
      worktree,
      label: labelFor(index, worktree),
    });
  }

  return {
    isRepo: true,
    branch,
    upstream,
    ahead,
    behind,
    remote: remote.ok ? remote.stdout.trim() : null,
    files,
  };
}

export async function gitLog(limit = 40): Promise<GitCommit[]> {
  const cwd = await getWorkspaceRoot();
  const result = await git(
    ["log", `-n`, String(limit), "--pretty=format:%H%x09%h%x09%an%x09%ad%x09%s", "--date=iso-strict"],
    cwd,
  );
  if (!result.ok) return [];
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, short, author, date, ...subject] = line.split("\t");
      return { hash, short, author, date, subject: subject.join("\t") };
    });
}

export async function gitInit() {
  const cwd = await getWorkspaceRoot();
  return git(["init"], cwd);
}

export async function gitCommit(message: string) {
  const cwd = await getWorkspaceRoot();
  const add = await git(["add", "-A"], cwd);
  if (!add.ok) return add;
  return git(["commit", "-m", message], cwd);
}

export async function gitPush() {
  const cwd = await getWorkspaceRoot();
  const upstream = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
  if (upstream.ok) return git(["push"], cwd);
  const origin = await git(["remote", "get-url", "origin"], cwd);
  if (!origin.ok) {
    return { ok: false as const, stdout: "", stderr: "No remote named origin. Add one with: git remote add origin <url>" };
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
