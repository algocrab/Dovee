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
