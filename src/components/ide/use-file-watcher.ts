"use client";

import { useEffect, useRef } from "react";
import { useIde } from "@/stores/ide-store";
import { refreshRoot } from "./file-tree";

type WatchPayload = {
  type?: string;
  path?: string;
  at?: number;
};

/**
 * Live workspace sync: file tree + clean open tabs refresh when disk changes.
 * Dirty tabs are left alone so local edits are never clobbered.
 */
export function useFileWatcher(enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<WatchPayload[]>([]);
  const treeDirty = useRef(false);
  const gitDirty = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") return;

    let es: EventSource | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const flush = async () => {
      timer.current = null;
      const batch = pending.current;
      pending.current = [];
      const doTree = treeDirty.current;
      const doGit = gitDirty.current;
      treeDirty.current = false;
      gitDirty.current = false;

      if (doTree) {
        try {
          await refreshRoot();
          const list = await fetch("/api/files/list").then((r) => r.json());
          useIde.getState().setFileIndex(list.files ?? []);
        } catch {
          /* ignore transient list errors */
        }
      }

      if (doGit) {
        try {
          const git = await fetch("/api/git").then((r) => r.json());
          if (git && typeof git === "object" && "isRepo" in git) {
            useIde.getState().setGitBranch(git.isRepo ? String(git.branch ?? "") : "");
          }
        } catch {
          /* ignore */
        }
      }

      // Reload clean open tabs that match changed paths.
      const changed = new Set(
        batch
          .filter((e) => e.type === "change" || e.type === "add")
          .map((e) => (e.path ?? "").replace(/\\/g, "/"))
          .filter(Boolean),
      );
      const removed = new Set(
        batch
          .filter((e) => e.type === "unlink" || e.type === "unlinkDir")
          .map((e) => (e.path ?? "").replace(/\\/g, "/"))
          .filter(Boolean),
      );

      if (changed.size === 0 && removed.size === 0) return;

      const { tabs, reloadTab, setStatus } = useIde.getState();
      for (const tab of tabs) {
        if (tab.kind === "diff") continue;
        const p = tab.path.replace(/\\/g, "/");
        if (removed.has(p)) {
          if (tab.content === tab.original) {
            setStatus(`${p} was deleted on disk`);
          }
          continue;
        }
        if (!changed.has(p)) continue;
        if (tab.content !== tab.original) continue; // keep dirty buffer
        try {
          const res = await fetch(`/api/files/read?path=${encodeURIComponent(p)}`);
          if (!res.ok) continue;
          const data = (await res.json()) as { content?: string };
          if (typeof data.content === "string" && data.content !== tab.content) {
            reloadTab(p, data.content);
          }
        } catch {
          /* ignore */
        }
      }
    };

    const schedule = (event: WatchPayload) => {
      pending.current.push(event);
      const t = event.type ?? "";
      if (t === "add" || t === "unlink" || t === "addDir" || t === "unlinkDir" || t === "change") {
        treeDirty.current = true;
        gitDirty.current = true;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, 250);
    };

    const connect = () => {
      if (closed) return;
      es?.close();
      es = new EventSource("/api/watch");
      es.onopen = () => {
        attempt = 0;
      };
      es.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data) as WatchPayload;
          if (!data || data.type === "ready") return;
          schedule(data);
        } catch {
          /* ignore malformed */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (closed) return;
        attempt += 1;
        const delay = Math.min(10_000, 500 * 2 ** Math.min(attempt, 4));
        retry = setTimeout(connect, delay);
      };
    };

    connect();

    const onWorkspace = () => {
      attempt = 0;
      connect();
    };
    window.addEventListener("dovee:workspace-changed", onWorkspace);

    return () => {
      closed = true;
      window.removeEventListener("dovee:workspace-changed", onWorkspace);
      if (retry) clearTimeout(retry);
      if (timer.current) clearTimeout(timer.current);
      es?.close();
    };
  }, [enabled]);
}
