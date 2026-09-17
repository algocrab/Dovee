import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { applyUnifiedDiff } from "./diff";
import { isBinaryPath, isIgnoredName } from "./ignore";
import { getWorkspaceRoot, listDir, pathExists, resolveSafe, toPosix } from "./workspace";

const execFileAsync = promisify(execFile);

export type ToolName =
  | "read_file"
  | "list_directory"
  | "search_codebase"
  | "write_file"
  | "apply_diff"
  | "run_terminal"
  | "get_diagnostics";

export type ToolResult = {
  ok: boolean;
  output: string;
  changedFiles?: string[];
};

const MAX_READ = 200_000;
const MAX_SEARCH_HITS = 80;
const MAX_SEARCH_FILE_BYTES = 400_000;

export const TOOL_SCHEMAS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description:
        "Read a file in the workspace. Use line ranges for large files. Line numbers are 1-based.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the workspace root" },
          start_line: { type: "integer", description: "1-based start line" },
          end_line: { type: "integer", description: "1-based end line (inclusive)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_directory",
      description: "List files and folders at a path (one level).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path relative to the workspace. Default ." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_codebase",
      description: "Search file contents with a regular expression across the workspace.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Regex or literal text to search for" },
          path_glob: { type: "string", description: "Optional glob like src/**/*.ts" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description:
        "Overwrite a file completely. Use for new files or full rewrites. Prefer apply_diff for edits.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_diff",
      description: "Apply a unified diff / patch to an existing file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          diff: { type: "string", description: "Unified diff with @@ hunks" },
        },
        required: ["path", "diff"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_terminal",
      description:
        "Run a shell command in the workspace. Do not run destructive commands without the user confirming first.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: { type: "string", description: "Optional subdirectory of the workspace" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_diagnostics",
      description: "Return TypeScript compiler errors for a file or the whole project.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Optional file to filter diagnostics" },
        },
      },
    },
  },
];

function formatRead(content: string, startLine = 1) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  return lines
    .map((line, i) => {
      const n = startLine + i;
      const show = i === 0 || n % 10 === 0;
      return show ? `${n}→${line}` : line;
    })
    .join("\n");
}

function globToRegExp(glob: string) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DS::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DS::/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

async function walkFiles(root: string, dir: string, glob?: RegExp, out: string[] = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (isIgnoredName(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(root, abs, glob, out);
      continue;
    }
    if (isBinaryPath(abs)) continue;
    const rel = toPosix(root, abs);
    if (glob && !glob.test(rel) && !glob.test(entry.name)) continue;
    out.push(abs);
  }
  return out;
}

function blockedCommand(command: string) {
  const c = command.toLowerCase();
  const patterns = [
    /format\s+[a-z]:/,
    /del\s+\/s\s+\/q\s+[a-z]:\\/,
    /rm\s+-rf\s+[\\/]/,
    /shutdown\b/,
    /rd\s+\/s\s+\/q\s+[a-z]:/,
  ];
  return patterns.some((p) => p.test(c));
}

export async function executeTool(name: string, rawArgs: string): Promise<ToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, output: `Invalid JSON arguments for ${name}: ${rawArgs}` };
  }

  const root = await getWorkspaceRoot();

  try {
    switch (name as ToolName) {
      case "read_file": {
        const rel = String(args.path ?? "");
        const abs = resolveSafe(root, rel);
        if (!(await pathExists(abs))) return { ok: false, output: `File not found: ${rel}` };
        const stat = await fs.stat(abs);
        if (stat.isDirectory()) return { ok: false, output: `${rel} is a directory. Use list_directory.` };
        if (isBinaryPath(abs)) return { ok: false, output: `Refusing to read binary file: ${rel}` };
        if (stat.size > MAX_READ * 4) {
          return { ok: false, output: `File is too large (${stat.size} bytes). Read a line range.` };
        }
        const raw = await fs.readFile(abs, "utf8");
        const all = raw.replace(/\r\n/g, "\n").split("\n");
        const start = Math.max(1, Number(args.start_line) || 1);
        const end = Math.min(all.length, Number(args.end_line) || all.length);
        const slice = all.slice(start - 1, end).join("\n");
        const body = formatRead(slice, start);
        const clipped = body.length > MAX_READ ? `${body.slice(0, MAX_READ)}\n… truncated` : body;
        return { ok: true, output: clipped };
      }
      case "list_directory": {
        const rel = String(args.path ?? ".");
        const abs = resolveSafe(root, rel);
        if (!(await pathExists(abs))) return { ok: false, output: `Directory not found: ${rel}` };
        const entries = await listDir(abs);
        const lines = entries.map((e) => `${e.isDirectory() ? "dir " : "file"} ${e.name}`);
        return { ok: true, output: lines.join("\n") || "(empty)" };
      }
      case "search_codebase": {
        const query = String(args.query ?? "");
        if (!query) return { ok: false, output: "query is required" };
        let regex: RegExp;
        try {
          regex = new RegExp(query, "i");
        } catch {
          regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        }
        const glob = args.path_glob ? globToRegExp(String(args.path_glob)) : undefined;
        const files = await walkFiles(root, root, glob);
        const hits: string[] = [];
        for (const file of files) {
          if (hits.length >= MAX_SEARCH_HITS) break;
          let content: string;
          try {
            const stat = await fs.stat(file);
            if (stat.size > MAX_SEARCH_FILE_BYTES) continue;
            content = await fs.readFile(file, "utf8");
          } catch {
            continue;
          }
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (!regex.test(lines[i])) continue;
            hits.push(`${toPosix(root, file)}:${i + 1}: ${lines[i].trim()}`);
            if (hits.length >= MAX_SEARCH_HITS) break;
          }
        }
        return {
          ok: true,
          output: hits.length ? hits.join("\n") : "No matches.",
        };
      }
      case "write_file": {
        const rel = String(args.path ?? "");
        const abs = resolveSafe(root, rel);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, String(args.content ?? ""), "utf8");
        return { ok: true, output: `Wrote ${rel}`, changedFiles: [toPosix(root, abs)] };
      }
      case "apply_diff": {
        const rel = String(args.path ?? "");
        const abs = resolveSafe(root, rel);
        if (!(await pathExists(abs))) return { ok: false, output: `File not found: ${rel}` };
        const original = await fs.readFile(abs, "utf8");
        const next = applyUnifiedDiff(original, String(args.diff ?? ""));
        await fs.writeFile(abs, next, "utf8");
        return { ok: true, output: `Patched ${rel}`, changedFiles: [toPosix(root, abs)] };
      }
      case "run_terminal": {
        const command = String(args.command ?? "").trim();
        if (!command) return { ok: false, output: "command is required" };
        if (blockedCommand(command)) {
          return { ok: false, output: "Blocked potentially destructive command. Ask the user to run it themselves." };
        }
        const cwdRel = args.cwd ? String(args.cwd) : ".";
        const cwd = resolveSafe(root, cwdRel);
        try {
          const isWin = process.platform === "win32";
          const { stdout, stderr } = await execFileAsync(
            isWin ? "powershell.exe" : "bash",
            isWin ? ["-NoProfile", "-NonInteractive", "-Command", command] : ["-lc", command],
            {
              cwd,
              timeout: 180_000,
              maxBuffer: 2_000_000,
              windowsHide: true,
            },
          );
          const text = [stdout, stderr].filter(Boolean).join("\n").trim();
          return { ok: true, output: text || "(no output)" };
        } catch (error) {
          const err = error as { stdout?: string; stderr?: string; message?: string };
          const text = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n").trim();
          return { ok: false, output: text || "Command failed" };
        }
      }
      case "get_diagnostics": {
        const tsconfig = path.join(root, "tsconfig.json");
        if (!(await pathExists(tsconfig))) {
          return { ok: true, output: "No tsconfig.json — nothing to type-check." };
        }
        try {
          const npx = process.platform === "win32" ? "npx.cmd" : "npx";
          const { stdout, stderr } = await execFileAsync(
            npx,
            ["--no-install", "tsc", "--noEmit", "--pretty", "false", "-p", tsconfig],
            { cwd: root, timeout: 120_000, windowsHide: true, shell: process.platform === "win32" },
          );
          const text = `${stdout}\n${stderr}`.trim();
          const filter = args.path ? String(args.path).replace(/\\/g, "/") : "";
          const lines = text
            .split(/\r?\n/)
            .filter((line) => (filter ? line.replace(/\\/g, "/").includes(filter) : true));
          return { ok: true, output: (filter ? lines.join("\n") : text) || "No diagnostics." };
        } catch (error) {
          const err = error as { stdout?: string; stderr?: string; message?: string };
          const text = [err.stdout, err.stderr].filter(Boolean).join("\n").trim() || err.message || "tsc failed";
          const filter = args.path ? String(args.path).replace(/\\/g, "/") : "";
          const lines = text
            .split(/\r?\n/)
            .filter((line) => (filter ? line.replace(/\\/g, "/").includes(filter) : true));
          return { ok: true, output: (filter ? lines.join("\n") : text) || text };
        }
      }
      default:
        return { ok: false, output: `Unknown tool: ${name}` };
    }
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) };
  }
}
