import fs from "node:fs/promises";
import path from "node:path";
import { isIgnoredName } from "./ignore";
import { loadSettings } from "./settings";

export async function getWorkspaceRoot() {
  const settings = await loadSettings();
  const root = path.resolve(/* turbopackIgnore: true */ settings.workspace || process.cwd());
  await fs.mkdir(root, { recursive: true });
  return root;
}

export function resolveSafe(root: string, userPath = ".") {
  const trimmed = (userPath || ".").trim() || ".";
  const abs = path.resolve(root, trimmed);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path is outside the workspace: ${userPath}`);
  }
  return abs;
}

export function toPosix(root: string, absPath: string) {
  const rel = path.relative(root, absPath);
  return rel.split(path.sep).join("/") || ".";
}

export async function pathExists(absPath: string) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

export async function listDir(absPath: string) {
  const entries = await fs.readdir(absPath, { withFileTypes: true });
  return entries
    .filter((entry) => !isIgnoredName(entry.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
}
