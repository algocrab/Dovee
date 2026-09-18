"use client";

import { useEffect, useRef } from "react";
import { useIde } from "@/stores/ide-store";
import { openFile } from "./file-tree";
import type { DebugEvent } from "@/types/debug";

export function useDebugSession() {
  const lastPause = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const apply = (event: DebugEvent) => {
      const store = useIde.getState();
      if (event.type === "snapshot") {
        store.applyDebugSnapshot(event);
        return;
      }
      if (event.type === "status") {
        store.setDebugStatus(event.status);
        if (event.message) store.setStatus(event.message);
        return;
      }
      if (event.type === "paused") {
        store.applyDebugSnapshot({
          status: "paused",
          frames: event.frames,
          vars: event.vars,
          output: store.debugOutput,
          paused: event.paused,
        });
        const key = `${event.paused.path}:${event.paused.line}:${event.paused.column}`;
        if (key !== lastPause.current) {
          lastPause.current = key;
          if (event.paused.path && !event.paused.path.includes("://") && !event.paused.path.startsWith("node:")) {
            void openFile(event.paused.path, { line: event.paused.line, column: event.paused.column });
          }
        }
        return;
      }
      if (event.type === "resumed") {
        store.setDebugStatus("running");
        store.clearDebugPaused();
        return;
      }
      if (event.type === "variables") {
        store.setDebugVars(event.vars);
        return;
      }
      if (event.type === "output") {
        store.appendDebugOutput(event.text);
        return;
      }
      if (event.type === "error") {
        store.setStatus(event.message);
        return;
      }
      if (event.type === "stopped") {
        store.resetDebugSession();
        store.setStatus(event.code == null ? "Debug stopped" : `Debug finished (${event.code})`);
      }
    };

    const connect = () => {
      if (closed) return;
      es?.close();
      es = new EventSource("/api/debug");
      es.onopen = () => {
        attempt = 0;
      };
      es.onmessage = (msg) => {
        try {
          apply(JSON.parse(msg.data) as DebugEvent);
        } catch {
          /* ignore malformed */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (closed) return;
        attempt += 1;
        retry = setTimeout(connect, Math.min(10_000, 500 * 2 ** Math.min(attempt, 4)));
      };
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, []);
}
