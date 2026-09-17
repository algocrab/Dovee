import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { IGNORE_DIRS } from "./ignore";
import { getWorkspaceRoot } from "./workspace";

export type WatchEvent = {
  type: "add" | "change" | "unlink" | "addDir" | "unlinkDir";
  /** Workspace-relative posix path. */
  path: string;
  at: number;
};

type WatchListener = (event: WatchEvent) => void;

let watcher: FSWatcher | null = null;
let watchRoot = "";
const listeners = new Set<WatchListener>();

const IGNORED_NAMES = new Set([...IGNORE_DIRS, ".DS_Store", "Thumbs.db"]);

function toPosixRel(root: string, abs: string) {
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

function shouldIgnore(absPath: string) {
  const parts = absPath.split(/[/\\]/).filter(Boolean);
  return parts.some((part) => IGNORED_NAMES.has(part));
}

async function ensureWatcher() {
  const root = await getWorkspaceRoot();
  if (watcher && watchRoot === root) return watcher;

  if (watcher) {
    await watcher.close().catch(() => undefined);
    watcher = null;
  }

  watchRoot = root;
  watcher = chokidar.watch(root, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 180, pollInterval: 40 },
    ignored: (p) => shouldIgnore(p),
    // Avoid fd storms on large trees; depth is unlimited but ignore filters node_modules etc.
    persistent: true,
  });

  const emit = (type: WatchEvent["type"], abs: string) => {
    const rel = toPosixRel(root, abs);
    if (!rel) return;
    const event: WatchEvent = { type, path: rel, at: Date.now() };
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        /* ignore bad listeners */
      }
    }
  };

  watcher
    .on("add", (p) => emit("add", p))
    .on("change", (p) => emit("change", p))
    .on("unlink", (p) => emit("unlink", p))
    .on("addDir", (p) => emit("addDir", p))
    .on("unlinkDir", (p) => emit("unlinkDir", p))
    .on("error", (err) => {
      console.error("[watcher]", err);
    });

  return watcher;
}

export function subscribeWatch(listener: WatchListener): () => void {
  listeners.add(listener);
  void ensureWatcher();
  return () => {
    listeners.delete(listener);
  };
}

/** Call after workspace folder changes so the next subscriber rebinds. */
export async function resetWatcher() {
  if (watcher) {
    await watcher.close().catch(() => undefined);
    watcher = null;
  }
  watchRoot = "";
  if (listeners.size > 0) await ensureWatcher();
}
