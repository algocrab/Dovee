import fs from "node:fs/promises";
import path from "node:path";
import { isBinaryPath, isIgnoredName } from "./ignore";
import { getWorkspaceRoot } from "./workspace";

export type IndexedFile = {
  path: string;
  size: number;
  hash: string;
  symbols: string[];
  imports: string[];
  preview: string;
};

export type ContextHit = IndexedFile & { score: number; reason: string };

let cachedRoot = "";
let cachedIndex: IndexedFile[] = [];
let indexedAt = 0;

function posix(root: string, file: string) {
  return path.relative(root, file).split(path.sep).join("/");
}

function simpleHash(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function symbolsAndImports(content: string) {
  const symbols = new Set<string>();
  const imports = new Set<string>();
  const symbolPattern =
    /\b(?:class|interface|type|enum|function|const|let|var)\s+([A-Za-z_$][\w$]*)|\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
  const importPattern = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
  for (const match of content.matchAll(symbolPattern)) {
    const value = match[1] ?? match[2];
    if (value) symbols.add(value);
  }
  for (const match of content.matchAll(importPattern)) {
    if (match[1]) imports.add(match[1]);
  }
  return { symbols: [...symbols].slice(0, 100), imports: [...imports].slice(0, 100) };
}

async function walk(root: string, dir: string, output: string[]) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (isIgnoredName(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, absolute, output);
    } else if (!isBinaryPath(absolute) && /\.(?:[cm]?[jt]sx?|json|md|css|html|py|go|rs|java|rb)$/i.test(entry.name)) {
      output.push(absolute);
    }
  }
}

export async function buildWorkspaceIndex(force = false) {
  const root = await getWorkspaceRoot();
  if (!force && root === cachedRoot && cachedIndex.length && Date.now() - indexedAt < 15_000) {
    return cachedIndex;
  }
  const files: string[] = [];
  await walk(root, root, files);
  const next: IndexedFile[] = [];
  for (const file of files.slice(0, 20_000)) {
    try {
      const stat = await fs.stat(file);
      if (stat.size > 500_000) continue;
      const content = await fs.readFile(file, "utf8");
      const { symbols, imports } = symbolsAndImports(content);
      next.push({
        path: posix(root, file),
        size: stat.size,
        hash: simpleHash(content),
        symbols,
        imports,
        preview: content.replace(/\s+/g, " ").trim().slice(0, 240),
      });
    } catch {
      /* Files can disappear while the watcher and indexer run together. */
    }
  }
  cachedRoot = root;
  cachedIndex = next;
  indexedAt = Date.now();
  return next;
}

export async function queryWorkspaceContext(query: string, activeFile?: string, refresh = false) {
  const index = await buildWorkspaceIndex(refresh);
  const needle = query.trim().toLowerCase();
  const active = activeFile?.replace(/\\/g, "/");
  return index
    .map((file) => {
      const haystack = `${file.path} ${file.symbols.join(" ")} ${file.imports.join(" ")} ${file.preview}`.toLowerCase();
      let score = 0;
      let reason = "workspace match";
      if (active && file.path === active) {
        score += 100;
        reason = "active file";
      }
      if (needle && file.path.toLowerCase().includes(needle)) {
        score += 60;
        reason = "path match";
      }
      if (needle && file.symbols.some((symbol) => symbol.toLowerCase().includes(needle))) {
        score += 50;
        reason = "symbol match";
      }
      if (needle && haystack.includes(needle)) score += 20;
      return { ...file, score, reason };
    })
    .filter((file) => file.score > 0 || !needle)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 40);
}

export function resetWorkspaceIndex() {
  cachedRoot = "";
  cachedIndex = [];
  indexedAt = 0;
}
