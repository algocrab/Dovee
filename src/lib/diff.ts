type Hunk = {
  oldStart: number;
  lines: Array<{ kind: " " | "+" | "-"; text: string }>;
};

function parseHunks(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  const lines = diff.replace(/\r\n/g, "\n").split("\n");
  let current: Hunk | null = null;

  for (const line of lines) {
    const header = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(line);
    if (header) {
      current = { oldStart: Number(header[1]), lines: [] };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) {
      continue;
    }
    const prefix = line[0];
    if (prefix === "+" || prefix === "-" || prefix === " ") {
      current.lines.push({ kind: prefix, text: line.slice(1) });
    } else if (line === "\\ No newline at end of file") {
      continue;
    }
  }
  return hunks;
}

function findHunkIndex(fileLines: string[], hunk: Hunk): number {
  const context = hunk.lines.filter((l) => l.kind === " " || l.kind === "-").map((l) => l.text);
  if (context.length === 0) return Math.max(0, hunk.oldStart - 1);

  const startGuess = Math.max(0, hunk.oldStart - 1);
  const window = 40;

  for (let offset = 0; offset <= window; offset++) {
    for (const idx of [startGuess + offset, startGuess - offset]) {
      if (idx < 0 || idx + context.length > fileLines.length) continue;
      let ok = true;
      for (let i = 0; i < context.length; i++) {
        if (fileLines[idx + i] !== context[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return idx;
    }
  }

  throw new Error(
    `Could not apply hunk at line ${hunk.oldStart}. Context did not match the file. Re-read the file and try again.`,
  );
}

export function applyUnifiedDiff(original: string, diff: string): string {
  const hunks = parseHunks(diff);
  if (hunks.length === 0) {
    throw new Error("No unified-diff hunks found. Use @@ ... @@ format, or write_file instead.");
  }

  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  let lines = original.replace(/\r\n/g, "\n").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines = lines.slice(0, -1);

  let shift = 0;
  for (const hunk of hunks) {
    const at = findHunkIndex(lines, hunk) + shift;
    const oldCount = hunk.lines.filter((l) => l.kind === " " || l.kind === "-").length;
    const next = hunk.lines.filter((l) => l.kind === " " || l.kind === "+").map((l) => l.text);
    lines.splice(at, oldCount, ...next);
    shift += next.length - oldCount;
  }

  const endedWithNewline = original.endsWith("\n") || original.endsWith("\r\n");
  return lines.join(newline) + (endedWithNewline ? newline : "");
}

/** Both sides of an agent (or git) file change, for a visual DiffEditor. */
export type FileDiff = {
  path: string;
  original: string;
  modified: string;
  truncated?: boolean;
};

export type DiffPreviewLine = {
  kind: "context" | "add" | "del";
  text: string;
};

/** Cap each side so chats.json / SSE frames stay reasonable. */
export const MAX_DIFF_SIDE = 80_000;
const LCS_LIMIT = 500;
const PREVIEW_MAX = 80;

export function packFileDiff(path: string, original: string, modified: string): FileDiff {
  const tooBig = original.length > MAX_DIFF_SIDE || modified.length > MAX_DIFF_SIDE;
  return {
    path,
    original: tooBig ? original.slice(0, MAX_DIFF_SIDE) : original,
    modified: tooBig ? modified.slice(0, MAX_DIFF_SIDE) : modified,
    truncated: tooBig || undefined,
  };
}

function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function lcsDiff(a: string[], b: string[]): DiffPreviewLine[] {
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const rev: DiffPreviewLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      rev.push({ kind: "context", text: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rev.push({ kind: "add", text: b[j - 1] });
      j -= 1;
    } else {
      rev.push({ kind: "del", text: a[i - 1] });
      i -= 1;
    }
  }
  return rev.reverse();
}

function linedDiff(a: string[], b: string[]): DiffPreviewLine[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const out: DiffPreviewLine[] = [];
  for (const text of a.slice(Math.max(0, start - 2), start)) out.push({ kind: "context", text });
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length > LCS_LIMIT || midB.length > LCS_LIMIT || midA.length * midB.length > 80_000) {
    for (const text of midA) out.push({ kind: "del", text });
    for (const text of midB) out.push({ kind: "add", text });
  } else {
    out.push(...lcsDiff(midA, midB));
  }
  for (const text of a.slice(endA, Math.min(a.length, endA + 2))) out.push({ kind: "context", text });
  return out;
}

/** Compact colored hunk list for the agent tool card. */
export function previewDiff(original: string, modified: string, max = PREVIEW_MAX): {
  lines: DiffPreviewLine[];
  hidden: number;
} {
  const raw = linedDiff(splitLines(original), splitLines(modified));
  if (raw.length <= max) return { lines: raw, hidden: 0 };
  const changed = raw.filter((line) => line.kind !== "context");
  if (changed.length >= max) return { lines: changed.slice(0, max), hidden: raw.length - max };
  const extra = max - changed.length;
  const context = raw.filter((line) => line.kind === "context").slice(0, extra);
  return { lines: [...context, ...changed].slice(0, max), hidden: raw.length - max };
}
