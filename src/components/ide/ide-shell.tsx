"use client";

import { Files, GitBranch, Search, Settings, SquareTerminal, WandSparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useIde } from "@/stores/ide-store";
import { AgentPanel } from "./agent-panel";
import { CommandPalette } from "./command-palette";
import { FileTree, refreshRoot } from "./file-tree";
import { GitPanel } from "./git-panel";
import { SearchPanel } from "./search-panel";
import { SettingsModal } from "./settings-modal";

const MonacoPane = dynamic(() => import("./monaco-pane").then((m) => m.MonacoPane), { ssr: false });
const TerminalPanel = dynamic(() => import("./terminal-panel").then((m) => m.TerminalPanel), { ssr: false });

export function IdeShell() {
  const leftTab = useIde((s) => s.leftTab);
  const tabs = useIde((s) => s.tabs);
  const activePath = useIde((s) => s.activePath);
  const agentOpen = useIde((s) => s.agentOpen);
  const terminalOpen = useIde((s) => s.terminalOpen);
  const terminalHeight = useIde((s) => s.terminalHeight);
  const agentWidth = useIde((s) => s.agentWidth);
  const settings = useIde((s) => s.settings);
  const cursor = useIde((s) => s.cursor);
  const status = useIde((s) => s.status);
  const gitBranch = useIde((s) => s.gitBranch);
  const abortRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    void (async () => {
      const s = await fetch("/api/settings").then((r) => r.json());
      useIde.getState().setSettings(s);
      if (!s.hasApiKey) useIde.getState().setSettingsOpen(true);
      await refreshRoot();
      const list = await fetch("/api/files/list").then((r) => r.json());
      useIde.getState().setFileIndex(list.files ?? []);
      const git = await fetch("/api/git").then((r) => r.json());
      if (git.isRepo) useIde.getState().setGitBranch(git.branch);
    })();
  }, []);

  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "p") {
        e.preventDefault();
        useIde.getState().setCommandOpen(true);
      }
      if (meta && e.key.toLowerCase() === "l") {
        e.preventDefault();
        useIde.setState({ agentOpen: true });
      }
      if (meta && e.key === "`") {
        e.preventDefault();
        useIde.getState().toggleTerminal();
      }
      if (meta && e.key === ",") {
        e.preventDefault();
        useIde.getState().setSettingsOpen(true);
      }
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const state = useIde.getState();
        const tab = state.tabs.find((t) => t.path === state.activePath);
        if (!tab) return;
        await fetch("/api/files/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: tab.path, content: tab.content }),
        });
        state.markSaved(tab.path);
        state.setStatus(`Saved ${tab.path}`);
      }
      if (e.key === "Escape") {
        useIde.getState().setCommandOpen(false);
        for (const c of abortRef.current.values()) c.abort();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeTab = tabs.find((t) => t.path === activePath);

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <header className="flex h-10 items-center justify-between border-b border-line bg-bg-1 px-3">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden>
            <path d="M7 18c6-9 13-10 18-8-4 2-6 6-6 10 4-1 7-1 9 1-6 1-11 4-16 4-4 0-6-3-5-7z" fill="#7dd3c0" />
          </svg>
          <span className="text-sm tracking-wide">Dovee</span>
          <span className="hidden text-[11px] text-muted sm:inline">local IDE · DeepSeek V4.1</span>
        </div>
        <div className="truncate px-4 font-mono text-[11px] text-muted">{activePath ?? "no file"}</div>
        <button
          type="button"
          onClick={() => useIde.getState().setSettingsOpen(true)}
          className="rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-text"
        >
          <Settings className="h-4 w-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-11 flex-col items-center gap-1 border-r border-line bg-bg-1 py-2">
          <RailBtn active={leftTab === "explorer"} onClick={() => useIde.getState().setLeftTab("explorer")} title="Explorer">
            <Files className="h-4 w-4" />
          </RailBtn>
          <RailBtn active={leftTab === "search"} onClick={() => useIde.getState().setLeftTab("search")} title="Search">
            <Search className="h-4 w-4" />
          </RailBtn>
          <RailBtn active={leftTab === "git"} onClick={() => useIde.getState().setLeftTab("git")} title="Git">
            <GitBranch className="h-4 w-4" />
          </RailBtn>
          <div className="flex-1" />
          <RailBtn active={terminalOpen} onClick={() => useIde.getState().toggleTerminal()} title="Terminal">
            <SquareTerminal className="h-4 w-4" />
          </RailBtn>
          <RailBtn active={agentOpen} onClick={() => useIde.getState().toggleAgent()} title="Agent">
            <WandSparkles className="h-4 w-4" />
          </RailBtn>
        </nav>

        <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-bg-1">
          {leftTab === "explorer" ? <FileTree /> : leftTab === "search" ? <SearchPanel /> : <GitPanel />}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 items-center gap-0.5 overflow-x-auto border-b border-line bg-bg-1 px-1">
            {tabs.map((tab) => {
              const dirty = tab.content !== tab.original;
              return (
                <button
                  key={tab.path}
                  type="button"
                  onClick={() => useIde.getState().setActive(tab.path)}
                  className={cn(
                    "group flex max-w-[180px] items-center gap-1.5 rounded-t-md px-2.5 py-1.5 font-mono text-[11px]",
                    tab.path === activePath ? "bg-bg text-text" : "text-muted hover:bg-white/5",
                  )}
                >
                  <span className="truncate">{tab.path.split("/").pop()}</span>
                  {dirty && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
                  <X
                    className="h-3 w-3 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      useIde.getState().closeTab(tab.path);
                    }}
                  />
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1">
            <MonacoPane />
          </div>
          {terminalOpen && (
            <div style={{ height: terminalHeight }} className="relative shrink-0">
              <div
                className="absolute inset-x-0 -top-1 z-10 h-2 cursor-ns-resize"
                onMouseDown={(e) => {
                  const startY = e.clientY;
                  const startH = useIde.getState().terminalHeight;
                  const move = (ev: MouseEvent) => {
                    useIde.getState().setTerminalHeight(Math.max(120, Math.min(480, startH + (startY - ev.clientY))));
                  };
                  const up = () => {
                    window.removeEventListener("mousemove", move);
                    window.removeEventListener("mouseup", up);
                  };
                  window.addEventListener("mousemove", move);
                  window.addEventListener("mouseup", up);
                }}
              />
              <TerminalPanel />
            </div>
          )}
        </section>

        {agentOpen && (
          <div style={{ width: agentWidth }} className="relative shrink-0">
            <div
              className="absolute inset-y-0 -left-1 z-10 w-2 cursor-ew-resize"
              onMouseDown={(e) => {
                const startX = e.clientX;
                const startW = useIde.getState().agentWidth;
                const move = (ev: MouseEvent) => {
                  useIde.getState().setAgentWidth(Math.max(280, Math.min(640, startW - (ev.clientX - startX))));
                };
                const up = () => {
                  window.removeEventListener("mousemove", move);
                  window.removeEventListener("mouseup", up);
                };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
              }}
            />
            <AgentPanel abortRef={abortRef} />
          </div>
        )}
      </div>

      <footer className="flex h-7 items-center justify-between border-t border-line bg-bg-1 px-3 font-mono text-[10px] text-muted">
        <span>{status}</span>
        <span className="flex items-center gap-3">
          {gitBranch && (
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-text"
              onClick={() => useIde.getState().setLeftTab("git")}
            >
              <GitBranch className="h-3 w-3" />
              {gitBranch}
            </button>
          )}
          {activeTab && (
            <span>
              Ln {cursor.line}, Col {cursor.column}
            </span>
          )}
          <span>{settings?.model ?? "deepseek-flash"}</span>
          <span className={settings?.hasApiKey ? "text-green" : "text-rose"}>
            {settings?.hasApiKey ? "API key" : "no key"}
          </span>
        </span>
      </footer>

      <SettingsModal />
      <CommandPalette />
    </div>
  );
}

function RailBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md p-2 text-muted hover:bg-white/5 hover:text-text",
        active && "bg-white/5 text-teal",
      )}
    >
      {children}
    </button>
  );
}
