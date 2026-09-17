import fs from "node:fs/promises";
import path from "node:path";
import { isBinaryPath, isIgnoredName } from "./ignore";
import { getWorkspaceRoot } from "./workspace";

const MAX_SEARCH_HITS = 80;
const MAX_SEARCH_SCAN = 400;
const MAX_SEARCH_FILE_BYTES = 400_000;

export type SearchHit = {
  path: string;
  line: number;
  text: string;
  column: number;
  match: string;
};

export type SearchOptions = {
  query: string;
  pathGlob?: string;
  caseSensitive?: boolean;
  useRegex?: boolean;
  wholeWord?: boolean;
  limit?: number;
  offset?: number;
};

export type SearchResponse = {
  hits: SearchHit[];
  total: number;
  truncated: boolean;
  error?: string;
};

export type ReplaceResult = {
  ok: boolean;
  filesChanged: number;
  replacements: number;
  changedFiles: string[];
  error?: string;
};

function toPosix(root: string, abs: string) {
  return path.relative(root, abs).split(path.sep).join("/");
}

function resolveSafe(root: string, rel: string) {
  const abs = path.resolve(root, rel);
  const normRoot = path.resolve(root);
  if (abs !== normRoot && !abs.startsWith(normRoot + path.sep)) {
    throw new Error("Path escapes workspace");
  }
  return abs;
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

function buildSearchRegex(opts: {
  query: string;
  caseSensitive?: boolean;
  useRegex?: boolean;
  wholeWord?: boolean;
}): RegExp {
  const flags = opts.caseSensitive ? "g" : "gi";
  let source: string;
  if (opts.useRegex === false) {
    source = opts.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  } else {
    try {
      // Validate user regex; fall back to literal on syntax errors.
      new RegExp(opts.query);
      source = opts.query;
    } catch {
      source = opts.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  if (opts.wholeWord) source = `\\b(?:${source})\\b`;
  return new RegExp(source, flags);
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

/** Structured workspace text search used by the Search panel + agent tool. */
export async function searchWorkspace(opts: SearchOptions): Promise<SearchResponse> {
  const query = opts.query ?? "";
  if (!query) return { hits: [], total: 0, truncated: false, error: "query is required" };

  let regex: RegExp;
  try {
    regex = buildSearchRegex(opts);
  } catch (error) {
    return {
      hits: [],
      total: 0,
      truncated: false,
      error: error instanceof Error ? error.message : "Invalid search pattern",
    };
  }

  const root = await getWorkspaceRoot();
  const glob = opts.pathGlob ? globToRegExp(opts.pathGlob) : undefined;
  const files = await walkFiles(root, root, glob);
  const limit = Math.min(Math.max(opts.limit ?? MAX_SEARCH_HITS, 1), MAX_SEARCH_HITS);
  const offset = Math.max(opts.offset ?? 0, 0);
  const collected: SearchHit[] = [];
  let total = 0;
  let truncated = false;

  outer: for (const file of files) {
    let content: string;
    try {
      const stat = await fs.stat(file);
      if (stat.size > MAX_SEARCH_FILE_BYTES) continue;
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    const rel = toPosix(root, file);
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(line)) !== null) {
        total += 1;
        if (total > offset && collected.length < limit) {
          collected.push({
            path: rel,
            line: i + 1,
            column: (m.index ?? 0) + 1,
            text: line.trimEnd(),
            match: m[0] ?? "",
          });
        }
        if (total >= MAX_SEARCH_SCAN) {
          truncated = true;
          break outer;
        }
        if (!m[0]) regex.lastIndex += 1;
      }
    }
  }

  if (total > offset + collected.length) truncated = true;
  return { hits: collected, total, truncated };
}

/** Replace matches across the workspace. When `paths` is set, only those files are touched. */
export async function replaceInWorkspace(opts: {
  query: string;
  replace: string;
  pathGlob?: string;
  caseSensitive?: boolean;
  useRegex?: boolean;
  wholeWord?: boolean;
  paths?: string[];
}): Promise<ReplaceResult> {
  const query = opts.query ?? "";
  if (!query) {
    return { ok: false, filesChanged: 0, replacements: 0, changedFiles: [], error: "query is required" };
  }

  let regex: RegExp;
  try {
    regex = buildSearchRegex(opts);
  } catch (error) {
    return {
      ok: false,
      filesChanged: 0,
      replacements: 0,
      changedFiles: [],
      error: error instanceof Error ? error.message : "Invalid search pattern",
    };
  }

  const root = await getWorkspaceRoot();
  const replacement = opts.replace ?? "";
  let targets: string[];
  try {
    if (opts.paths?.length) {
      targets = opts.paths.map((p) => resolveSafe(root, p));
    } else {
      const glob = opts.pathGlob ? globToRegExp(opts.pathGlob) : undefined;
      targets = await walkFiles(root, root, glob);
    }
  } catch (error) {
    return {
      ok: false,
      filesChanged: 0,
      replacements: 0,
      changedFiles: [],
      error: error instanceof Error ? error.message : "Invalid path",
    };
  }

  let filesChanged = 0;
  let replacements = 0;
  const changedFiles: string[] = [];

  for (const abs of targets) {
    let content: string;
    try {
      const stat = await fs.stat(abs);
      if (stat.size > MAX_SEARCH_FILE_BYTES) continue;
      content = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }
    regex.lastIndex = 0;
    if (!regex.test(content)) continue;
    regex.lastIndex = 0;
    let count = 0;
    const next = content.replace(regex, (...args) => {
      count += 1;
      if (opts.useRegex === false) return replacement;
      const match = args[0] as string;
      const groups = args.slice(1, -2) as string[];
      return replacement.replace(/\$(\d+)/g, (_, n: string) => {
        const idx = Number(n);
        if (idx === 0) return match;
        return groups[idx - 1] ?? "";
      });
    });
    if (next === content) continue;
    await fs.writeFile(abs, next, "utf8");
    filesChanged += 1;
    replacements += count;
    changedFiles.push(toPosix(root, abs));
  }

  return { ok: true, filesChanged, replacements, changedFiles };
}
