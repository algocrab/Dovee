"use client";

import { Files, GitBranch, Search, Settings, SquareTerminal, SunMoon, WandSparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useDesktopApp } from "@/lib/desktop";
import { applyEditorFontSize, applyTheme, THEMES, type ThemeId } from "@/lib/theme";
import { useIde } from "@/stores/ide-store";
import { closeTabSafe, createNewFile, openFolder, openNewWindow, persistAppearance, persistChats, pickOpenFile, refreshProblems, saveAll, saveTab } from "./actions";
import { SelectionActions } from "./add-to-chat";
import { AgentPanel } from "./agent-panel";
import { BottomPanel } from "./bottom-panel";
import { DoveeWordmark, EditorWelcome, IconButton, StatusSep } from "./chrome";
import { CommandPalette } from "./command-palette";
import { FileGlyph } from "./file-icon";
import { FileTree, refreshRoot } from "./file-tree";
import { GitPanel } from "./git-panel";
import { MenuBar } from "./menu-bar";
import { SearchPanel } from "./search-panel";
import { SettingsModal } from "./settings-modal";
import { useFileWatcher } from "./use-file-watcher";

const MonacoPane = dynamic(() => import("./monaco-pane").then((m) => m.MonacoPane), {
  ssr: false,
  loading: () => <EditorWelcome />,
});

export function IdeShell() {
  const leftTab = useIde((s) => s.leftTab);
  const tabs = useIde((s) => s.tabs);
  const activePath = useIde((s) => s.activePath);
  const agentOpen = useIde((s) => s.agentOpen);
  const terminalOpen = useIde((s) => s.terminalOpen);
  const terminalHeight = useIde((s) => s.terminalHeight);
  const agentWidth = useIde((s) => s.agentWidth);
  const sidebarWidth = useIde((s) => s.sidebarWidth);
  const settings = useIde((s) => s.settings);
  const cursor = useIde((s) => s.cursor);
  const status = useIde((s) => s.status);
  const gitBranch = useIde((s) => s.gitBranch);
  const problems = useIde((s) => s.problems);
  const abortRef = useRef<Map<string, AbortController>>(new Map());
  const chordK = useRef(false);
  const chatsHydrated = useRef(false);
  useDesktopApp();
  useFileWatcher(Boolean(settings?.hasFolder !== false));

  useEffect(() => {
    void (async () => {
      const s = await fetch("/api/settings").then((r) => r.json());
      useIde.getState().setSettings(s);
      applyTheme((s.theme as ThemeId) || "dark");
      applyEditorFontSize(typeof s.editorFontSize === "number" ? s.editorFontSize : 15);
      if (!s.hasApiKey) useIde.getState().setSettingsOpen(true);
      await refreshRoot();
      const list = await fetch("/api/files/list").then((r) => r.json());
      useIde.getState().setFileIndex(list.files ?? []);
      const git = await fetch("/api/git").then((r) => r.json());
      if (git.isRepo) useIde.getState().setGitBranch(git.branch);
      await refreshProblems();
    })();
  }, []);

  // Chats are kept in ~/.dovee/chats.json so a reload no longer wipes them.
  useEffect(() => {
    void (async () => {
      try {
        const data = await fetch("/api/chats").then((r) => r.json());
        useIde
          .getState()
          .hydrateChats(Array.isArray(data.chats) ? data.chats : [], String(data.activeChatId ?? ""));
      } catch {
        /* fall back to a fresh chat when the store cannot be read */
      }
      chatsHydrated.current = true;
    })();
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = useIde.getState().chats;
    const save = () => {
      if (!chatsHydrated.current) return;
      void persistChats();
    };
    const unsubscribe = useIde.subscribe((s) => {
      if (s.chats === last) return;
      last = s.chats;
      if (!chatsHydrated.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 800);
    });
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      if (timer) clearTimeout(timer);
      save();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!settings?.autoSave) return;
    const timer = setInterval(() => {
      void saveAll();
    }, 4000);
    return () => clearInterval(timer);
  }, [settings?.autoSave]);

  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        useIde.getState().setCommandOpen(true, "commands");
        return;
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openNewWindow();
        return;
      }
      if (meta && e.key.toLowerCase() === "p") {
        e.preventDefault();
        useIde.getState().setCommandOpen(true, "files");
      }
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        chordK.current = true;
        window.setTimeout(() => {
          chordK.current = false;
        }, 1500);
        return;
      }
      if (meta && e.key.toLowerCase() === "o") {
        e.preventDefault();
        if (chordK.current) {
          chordK.current = false;
          void openFolder();
          return;
        }
        pickOpenFile();
        return;
      }
      if (chordK.current && meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        chordK.current = false;
        void saveAll();
        return;
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        useIde.getState().setLeftTab("search");
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        useIde.getState().setLeftTab("git");
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        useIde.getState().setLeftTab("explorer");
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
      if (meta && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void createNewFile();
      }
      if (meta && e.key.toLowerCase() === "w") {
        e.preventDefault();
        const path = useIde.getState().activePath;
        if (path) closeTabSafe(path);
      }
      if (meta && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        const size = useIde.getState().settings?.editorFontSize ?? 15;
        void persistAppearance({ editorFontSize: Math.min(22, size + 1) });
      }
      if (meta && e.key === "-") {
        e.preventDefault();
        const size = useIde.getState().settings?.editorFontSize ?? 15;
        void persistAppearance({ editorFontSize: Math.max(11, size - 1) });
      }
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const state = useIde.getState();
        if (state.activePath) await saveTab(state.activePath);
        void refreshProblems();
      }
      if (e.key === "Escape") {
        useIde.getState().setCommandOpen(false);
        for (const c of abortRef.current.values()) c.abort();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useIde.getState().tabs.some((tab) => tab.kind !== "diff" && tab.content !== tab.original)) {
        return;
      }
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const activeTab = tabs.find((t) => t.path === activePath);
  const crumbs = activePath?.split("/") ?? [];
  const errCount = problems.filter((p) => p.severity === "error").length;
  const theme = (settings?.theme ?? "dark") as ThemeId;

  function cycleTheme() {
    const ids = THEMES.map((t) => t.id);
    const next = ids[(ids.indexOf(theme) + 1) % ids.length];
    void persistAppearance({ theme: next });
  }

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-bg-1 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <DoveeWordmark height={26} />
          <MenuBar />
        </div>
        <div className="min-w-0 flex-1 truncate text-center font-mono text-[12px] text-muted">
          {activePath ?? ""}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton title={`Theme: ${theme} (click to cycle)`} onClick={cycleTheme}>
            <SunMoon className="h-4 w-4" />
          </IconButton>
          <IconButton title="Settings" onClick={() => useIde.getState().setSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-11 shrink-0 flex-col items-stretch border-r border-line bg-bg-1 py-1">
          <RailBtn active={leftTab === "explorer"} onClick={() => useIde.getState().setLeftTab("explorer")} title="Explorer">
            <Files className="h-[18px] w-[18px]" />
          </RailBtn>
          <RailBtn active={leftTab === "search"} onClick={() => useIde.getState().setLeftTab("search")} title="Search">
            <Search className="h-[18px] w-[18px]" />
          </RailBtn>
          <RailBtn active={leftTab === "git"} onClick={() => useIde.getState().setLeftTab("git")} title="Git">
            <GitBranch className="h-[18px] w-[18px]" />
          </RailBtn>
          <div className="flex-1" />
          <RailBtn active={terminalOpen} onClick={() => useIde.getState().toggleTerminal()} title="Terminal">
            <SquareTerminal className="h-[18px] w-[18px]" />
          </RailBtn>
          <RailBtn active={agentOpen} onClick={() => useIde.getState().toggleAgent()} title="Agent">
            <WandSparkles className="h-[18px] w-[18px]" />
          </RailBtn>
        </nav>

        <aside style={{ width: sidebarWidth }} className="relative flex shrink-0 flex-col border-r border-line bg-bg-1">
          {leftTab === "explorer" ? <FileTree /> : leftTab === "search" ? <SearchPanel /> : <GitPanel />}
          <div
            className="resize-x -right-0.5"
            onMouseDown={(e) => {
              const startX = e.clientX;
              const startW = useIde.getState().sidebarWidth;
              const move = (ev: MouseEvent) => {
                useIde.getState().setSidebarWidth(Math.max(200, Math.min(480, startW + (ev.clientX - startX))));
              };
              const up = () => {
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
              };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
          />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[var(--editor-bg)]">
          {tabs.length > 0 && (
            <div className="flex h-9 items-center gap-0.5 overflow-x-auto border-b border-line bg-bg-1 px-1">
              {tabs.map((tab) => {
                const dirty = tab.kind !== "diff" && tab.content !== tab.original;
                const active = tab.path === activePath;
                const label = (tab.sourcePath ?? tab.path).split("/").pop() ?? tab.path;
                return (
                  <button
                    key={tab.path}
                    type="button"
                    onClick={() => useIde.getState().setActive(tab.path)}
                    className={cn(
                      "group flex max-w-[200px] items-center gap-1.5 border-t-2 px-3 py-1.5 font-mono text-[13px]",
                      active
                        ? "border-teal bg-bg text-text"
                        : "border-transparent text-muted hover:bg-hover hover:text-text",
                    )}
                  >
                    <FileGlyph name={label} />
                    <span className="truncate">
                      {tab.kind === "diff" ? (
                        <span className="text-muted">diff · </span>
                      ) : null}
                      {label}
                    </span>
                    {dirty && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
                    <X
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 rounded-sm hover:bg-hover",
                        active ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-70",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTabSafe(tab.path);
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}
          {activePath && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-line bg-bg-1/80 px-3 py-1 font-mono text-[12px] text-muted">
              {crumbs.map((part, i) => (
                <span key={`${part}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted/50">/</span>}
                  <span className={i === crumbs.length - 1 ? "text-text" : ""}>{part}</span>
                </span>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1">
            <MonacoPane />
          </div>
          {terminalOpen && (
            <div style={{ height: terminalHeight }} className="relative shrink-0">
              <div
                className="resize-y -top-0.5"
                onMouseDown={(e) => {
                  const startY = e.clientY;
                  const startH = useIde.getState().terminalHeight;
                  const move = (ev: MouseEvent) => {
                    useIde.getState().setTerminalHeight(Math.max(140, Math.min(520, startH + (startY - ev.clientY))));
                  };
                  const up = () => {
                    window.removeEventListener("mousemove", move);
                    window.removeEventListener("mouseup", up);
                  };
                  window.addEventListener("mousemove", move);
                  window.addEventListener("mouseup", up);
                }}
              />
              <BottomPanel />
            </div>
          )}
        </section>

        {agentOpen && (
          <div style={{ width: agentWidth }} className="relative shrink-0">
            <div
              className="resize-x -left-0.5"
              onMouseDown={(e) => {
                const startX = e.clientX;
                const startW = useIde.getState().agentWidth;
                const move = (ev: MouseEvent) => {
                  useIde.getState().setAgentWidth(Math.max(300, Math.min(720, startW - (ev.clientX - startX))));
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

      <footer className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-line bg-bg-1 px-3 font-mono text-[12px] text-muted">
        <button type="button" className="hover:text-text" onClick={() => useIde.getState().setBottomTab("problems")}>
          {status}
          {problems.length ? ` · ${errCount} errors` : ""}
        </button>
        <span className="flex min-w-0 items-center gap-2.5 overflow-hidden">
          {gitBranch && (
            <>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-text"
                onClick={() => useIde.getState().setLeftTab("git")}
              >
                <GitBranch className="h-3.5 w-3.5" />
                {gitBranch}
              </button>
              <StatusSep />
            </>
          )}
          {activeTab && (
            <>
              <span>
                {activeTab.language} · Ln {cursor.line}, Col {cursor.column}
              </span>
              <StatusSep />
            </>
          )}
          <button type="button" className="capitalize hover:text-text" onClick={cycleTheme} title="Cycle theme">
            {theme}
          </button>
          <StatusSep />
          <span>{settings?.editorFontSize ?? 15}px</span>
          <StatusSep />
          <span className="hidden truncate sm:inline">
            {settings?.provider ?? "deepseek"} · {settings?.model ?? "deepseek-flash"}
          </span>
          <StatusSep />
          <button
            type="button"
            className={settings?.hasApiKey ? "text-green hover:text-green" : "text-rose hover:text-rose"}
            onClick={() => useIde.getState().setSettingsOpen(true)}
          >
            {settings?.hasApiKey ? "API key" : "Add API key"}
          </button>
        </span>
      </footer>

      <SettingsModal />
      <SettingsModal />
      <CommandPalette />
      <SelectionActions />
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
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center border-l-2 border-transparent py-2.5 text-muted hover:bg-hover hover:text-text",
        active && "border-teal bg-hover text-teal",
      )}
    >
      {children}
    </button>
  );
}
