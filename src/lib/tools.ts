import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { applyUnifiedDiff, packFileDiff, type FileDiff } from "./diff";
import { isBinaryPath } from "./ignore";
import { searchWorkspace } from "./search";
import { queryWorkspaceContext } from "./indexer";
import { saveRecoverySnapshot } from "./recovery";
import { getWorkspaceRoot, listDir, pathExists, resolveSafe, toPosix } from "./workspace";

const execFileAsync = promisify(execFile);

export type ToolName =
  | "read_file"
  | "list_directory"
  | "search_codebase"
  | "inspect_context"
  | "write_file"
  | "apply_diff"
  | "run_terminal"
  | "get_diagnostics";

export type ToolResult = {
  ok: boolean;
  output: string;
  changedFiles?: string[];
  diff?: FileDiff;
};

/** Hard cap on characters returned from a single read_file call. */
const MAX_READ = 12_000;
/** When the model omits end_line, only return this many lines (forces ranged reads). */
const DEFAULT_READ_LINES = 400;
const MAX_TERMINAL_CHARS = 8_000;

export const TOOL_SCHEMAS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description:
        "Read a file in the workspace. Prefer start_line/end_line for anything non-trivial — unscoped reads return at most ~400 lines. Line numbers are 1-based.",
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
          case_sensitive: { type: "boolean", description: "Default false (case-insensitive)" },
          use_regex: {
            type: "boolean",
            description: "Treat query as regex. Default true for the agent; UI may pass false for literal search.",
          },
          whole_word: { type: "boolean", description: "Match whole words only" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "inspect_context",
      description: "Rank relevant workspace files, symbols, and imports for the current task before reading them.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Task, symbol, or file name to rank" },
          active_file: { type: "string", description: "Current file path, if any" },
          refresh: { type: "boolean", description: "Rebuild the local index before ranking" },
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
          return {
            ok: false,
            output: `File is too large (${stat.size} bytes). Call read_file with start_line/end_line.`,
          };
        }
        const raw = await fs.readFile(abs, "utf8");
        const all = raw.replace(/\r\n/g, "\n").split("\n");
        const start = Math.max(1, Number(args.start_line) || 1);
        const hasEnd = args.end_line != null && args.end_line !== "";
        const end = Math.min(
          all.length,
          hasEnd ? Number(args.end_line) || all.length : Math.min(all.length, start + DEFAULT_READ_LINES - 1),
        );
        const slice = all.slice(start - 1, end).join("\n");
        const body = formatRead(slice, start);
        let clipped = body.length > MAX_READ ? `${body.slice(0, MAX_READ)}\n… truncated` : body;
        const notes: string[] = [];
        if (!hasEnd && end < all.length) {
          notes.push(
            `Showing lines ${start}–${end} of ${all.length}. Pass end_line (or a higher start_line) to read more.`,
          );
        } else if (body.length > MAX_READ) {
          notes.push(`Output clipped to ${MAX_READ} chars. Use a tighter line range.`);
        }
        if (notes.length) clipped = `${clipped}\n\n[${notes.join(" ")}]`;
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
        const result = await searchWorkspace({
          query,
          pathGlob: args.path_glob ? String(args.path_glob) : undefined,
          caseSensitive: Boolean(args.case_sensitive),
          useRegex: args.use_regex === undefined ? true : Boolean(args.use_regex),
          wholeWord: Boolean(args.whole_word),
        });
        if (result.error) return { ok: false, output: result.error };
        const hits = result.hits.map((h) => `${h.path}:${h.line}: ${h.text.trim()}`);
        const more =
          result.truncated || result.total > hits.length
            ? `\n… ${result.total} total match${result.total === 1 ? "" : "es"} (showing ${hits.length})`
            : "";
        return {
          ok: true,
          output: hits.length ? `${hits.join("\n")}${more}` : "No matches.",
        };
      }
      case "inspect_context": {
        const query = String(args.query ?? "");
        if (!query) return { ok: false, output: "query is required" };
        const hits = await queryWorkspaceContext(query, args.active_file ? String(args.active_file) : undefined, Boolean(args.refresh));
        if (!hits.length) return { ok: true, output: "No indexed context matches." };
        return {
          ok: true,
          output: hits
            .map((hit) => `${hit.path} [${hit.reason}; score ${hit.score}] symbols=${hit.symbols.slice(0, 8).join(", ") || "none"} imports=${hit.imports.slice(0, 8).join(", ") || "none"}`)
            .join("\n"),
        };
      }
      case "write_file": {
        const rel = String(args.path ?? "");
        const abs = resolveSafe(root, rel);
        const modified = String(args.content ?? "");
        let original = "";
        const existed = await pathExists(abs);
        if (existed && !isBinaryPath(abs)) original = await fs.readFile(abs, "utf8");
        if (original !== modified) {
          await saveRecoverySnapshot({ path: rel, original, modified });
        }
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, modified, "utf8");
        const posix = toPosix(root, abs);
        const diff =
          !isBinaryPath(abs) && original !== modified ? packFileDiff(posix, original, modified) : undefined;
        return { ok: true, output: `Wrote ${rel}`, changedFiles: [posix], diff };
      }
      case "apply_diff": {
        const rel = String(args.path ?? "");
        const abs = resolveSafe(root, rel);
        if (!(await pathExists(abs))) return { ok: false, output: `File not found: ${rel}` };
        const original = await fs.readFile(abs, "utf8");
        const next = applyUnifiedDiff(original, String(args.diff ?? ""));
        if (original !== next) {
          await saveRecoverySnapshot({ path: rel, original, modified: next });
        }
        await fs.writeFile(abs, next, "utf8");
        const posix = toPosix(root, abs);
        const diff = original !== next ? packFileDiff(posix, original, next) : undefined;
        return { ok: true, output: `Patched ${rel}`, changedFiles: [posix], diff };
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
          const text = clipTerminal([stdout, stderr].filter(Boolean).join("\n").trim());
          return { ok: true, output: text || "(no output)" };
        } catch (error) {
          const err = error as { stdout?: string; stderr?: string; message?: string };
          const text = clipTerminal(
            [err.stdout, err.stderr, err.message].filter(Boolean).join("\n").trim(),
          );
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
            ["--no-install", "tsc", "--noEmit", "--pretty", "false", "-p", "tsconfig.json"],
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

function clipTerminal(text: string) {
  if (!text) return text;
  if (text.length <= MAX_TERMINAL_CHARS) return text;
  const head = Math.floor(MAX_TERMINAL_CHARS * 0.7);
  const tail = MAX_TERMINAL_CHARS - head - 40;
  return `${text.slice(0, head)}\n\n… [${text.length - head - tail} chars omitted] …\n\n${text.slice(-tail)}`;
}
