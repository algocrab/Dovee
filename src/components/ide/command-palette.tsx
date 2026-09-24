"use client";

import { useMemo, useState } from "react";
import { closeAllTabs, closeTabSafe, createNewFile, formatActive, openFolder, openNewWindow, persistAppearance, pickOpenFile, runProjectTests, saveAll, saveTab } from "./actions";
import { startDebugging, stopDebugging } from "./debug-actions";
import { runExtensionCommand } from "./extension-actions";
import { openFile } from "./file-tree";
import { useIde } from "@/stores/ide-store";

type Command = { id: string; label: string; run: () => void };

function fuzzyScore(value: string, query: string) {
  if (!query) return 0;
  const text = value.toLowerCase();
  let cursor = 0;
  let score = 0;
  let streak = 0;
  for (const char of query.toLowerCase()) {
    const index = text.indexOf(char, cursor);
    if (index < 0) return null;
    streak = index === cursor ? streak + 1 : 0;
    score += 10 + streak * 4 + (index === 0 || "/-_ .".includes(text[index - 1] ?? "") ? 8 : 0);
    cursor = index + 1;
  }
  return score - (text.length - query.length);
}

function fuzzyHits<T>(items: T[], query: string, getText: (item: T) => string) {
  return items
    .map((item) => ({ item, score: fuzzyScore(getText(item), query) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map((entry) => entry.item);
}

export function CommandPalette() {
  const open = useIde((s) => s.commandOpen);
  if (!open) return null;
  return <CommandPaletteInner />;
}

function CommandPaletteInner() {
  const files = useIde((s) => s.fileIndex);
  const mode = useIde((s) => s.commandMode);
  const extensions = useIde((s) => s.extensions);
  const [q, setQ] = useState(mode === "commands" ? ">" : "");
  const [idx, setIdx] = useState(0);

  const commands: Command[] = useMemo(() => {
    const g = () => useIde.getState();
    const extra = extensions
      .filter((ext) => ext.enabled)
      .flatMap((ext) =>
        ext.commands.map((command) => ({
          id: command.id,
          label: command.title,
          run: () => void runExtensionCommand(command.id),
        })),
      );
    return [
      { id: "file", label: "Go to File", run: () => g().setCommandOpen(true, "files") },
      { id: "open-file", label: "Open File", run: () => pickOpenFile() },
      { id: "open-folder", label: "Open Folder", run: () => void openFolder() },
      { id: "new-window", label: "New Window", run: () => openNewWindow() },
      { id: "new", label: "New File", run: () => void createNewFile() },
      { id: "save", label: "Save", run: () => g().activePath && void saveTab(g().activePath!) },
      { id: "save-all", label: "Save All", run: () => void saveAll() },
      { id: "close", label: "Close Editor", run: () => g().activePath && closeTabSafe(g().activePath!) },
      { id: "close-all", label: "Close All Editors", run: () => closeAllTabs() },
      { id: "split", label: "Split Editor Right", run: () => g().splitEditor() },
      { id: "join", label: "Join Editor Groups", run: () => g().joinEditors() },
      { id: "explorer", label: "Show Explorer", run: () => g().setLeftTab("explorer") },
      { id: "search", label: "Show Search", run: () => g().setLeftTab("search") },
      { id: "context", label: "Show Context Inspector", run: () => g().setLeftTab("context") },
      { id: "git", label: "Show Source Control", run: () => g().setLeftTab("git") },
      { id: "debug", label: "Show Run and Debug", run: () => g().setLeftTab("debug") },
      { id: "extensions", label: "Show Extensions", run: () => g().setLeftTab("extensions") },
      { id: "start-debug", label: "Start Debugging", run: () => void startDebugging() },
      { id: "stop-debug", label: "Stop Debugging", run: () => void stopDebugging() },
      { id: "term", label: "Toggle Terminal", run: () => g().toggleTerminal() },
      { id: "agent", label: "Toggle Agent", run: () => g().toggleAgent() },
      { id: "problems", label: "Show Problems", run: () => g().setBottomTab("problems") },
      { id: "settings", label: "Open Settings", run: () => g().setSettingsOpen(true) },
      { id: "dark", label: "Theme: Dark", run: () => void persistAppearance({ theme: "dark" }) },
      { id: "light", label: "Theme: Light", run: () => void persistAppearance({ theme: "light" }) },
      { id: "dusk", label: "Theme: Dusk", run: () => void persistAppearance({ theme: "dusk" }) },
      { id: "wrap", label: "Toggle Word Wrap", run: () => void persistAppearance({ wordWrap: !(g().settings?.wordWrap ?? true) }) },
      { id: "map", label: "Toggle Minimap", run: () => void persistAppearance({ minimap: !(g().settings?.minimap ?? false) }) },
      { id: "format", label: "Format Document", run: () => void formatActive() },
      { id: "tests", label: "Run Project Tests", run: () => void runProjectTests() },
      { id: "zoom-in", label: "Increase Font Size", run: () => void persistAppearance({ editorFontSize: Math.min(22, (g().settings?.editorFontSize ?? 15) + 1) }) },
      { id: "zoom-out", label: "Decrease Font Size", run: () => void persistAppearance({ editorFontSize: Math.max(11, (g().settings?.editorFontSize ?? 15) - 1) }) },
      ...extra,
    ];
  }, [extensions]);

  const isCmd = q.startsWith(">");
  const needle = (isCmd ? q.slice(1) : q).toLowerCase().trim();
  const fileHits = useMemo(
    () => fuzzyHits(files, needle, (file) => file),
    [files, needle],
  );
  const cmdHits = useMemo(
    () => fuzzyHits(commands, needle, (command) => command.label),
    [commands, needle],
  );
  const hits = isCmd ? cmdHits : fileHits;

  function choose(i: number) {
    useIde.getState().setCommandOpen(false);
    if (isCmd) {
      const cmd = cmdHits[i];
      if (cmd) cmd.run();
      return;
    }
    const path = fileHits[i];
    if (path) void openFile(path);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-overlay pt-[12vh]" onClick={() => useIde.getState().setCommandOpen(false)}>
      <div
        className="h-fit w-full max-w-xl overflow-hidden rounded-xl border border-line bg-bg-2 shadow-[var(--shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") useIde.getState().setCommandOpen(false);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(hits.length - 1, i + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(0, i - 1));
            }
            if (e.key === "Enter" && hits[idx]) choose(idx);
          }}
          placeholder={isCmd ? "Run a command…" : "Go to file…  (> for commands)"}
          className="w-full border-b border-line bg-transparent px-4 py-3 text-[15px] outline-none"
        />
        <div className="max-h-80 overflow-auto py-1">
          {hits.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-muted">
              {isCmd ? "No matching commands." : "No matching files."}
            </p>
          )}
          {isCmd
            ? cmdHits.map((cmd, i) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => choose(i)}
                  className={`block w-full truncate px-4 py-2 text-left text-[14px] ${i === idx ? "bg-teal/15 text-teal" : "text-muted hover:bg-hover"}`}
                >
                  {cmd.label}
                </button>
              ))
            : fileHits.map((path, i) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => choose(i)}
                  className={`block w-full truncate px-4 py-2 text-left font-mono text-[13px] ${i === idx ? "bg-teal/15 text-teal" : "text-muted hover:bg-hover"}`}
                >
                  {path}
                </button>
              ))}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 font-mono text-[11px] text-muted">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
