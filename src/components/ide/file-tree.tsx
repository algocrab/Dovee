"use client";

import { ChevronRight, Folder, FolderOpen, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { cn } from "@/lib/cn";
import { useIde, type TreeEntry } from "@/stores/ide-store";
import { openFolder } from "./actions";
import { IconButton, Kbd, PanelHeading } from "./chrome";
import { FileGlyph } from "./file-icon";

async function loadTree(path = ".") {
  const res = await fetch(`/api/files/tree?path=${encodeURIComponent(path)}`);
  const data = await res.json();
  return (data.entries ?? []) as TreeEntry[];
}

export async function refreshRoot() {
  const entries = await loadTree(".");
  useIde.getState().setTree(entries);
}

export async function openFile(path: string, reveal?: { line?: number; column?: number }) {
  const res = await fetch(`/api/files/read?path=${encodeURIComponent(path)}`);
  const data = await res.json();
  if (data.error) {
    useIde.getState().setStatus(data.error);
    return;
  }
  useIde.getState().openTab({
    path: data.path,
    content: data.content,
    original: data.content,
    language: data.language,
  });
  if (reveal?.line && reveal.line > 0) {
    const column = Math.max(1, reveal.column ?? 1);
    useIde.getState().setCursor(reveal.line, column);
    useIde.getState().revealIn(data.path, reveal.line, column);
  }
}

function Node({
  entry,
  depth,
  onContext,
}: {
  entry: TreeEntry;
  depth: number;
  onContext: (e: MouseEvent, entry: TreeEntry) => void;
}) {
  const expanded = useIde((s) => s.expanded[entry.path]);
  const activePath = useIde((s) => s.activePath);
  const isDir = entry.type === "dir";
  const open = Array.isArray(expanded);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(entry.name);

  async function toggle() {
    if (!isDir) {
      await openFile(entry.path);
      return;
    }
    if (open) {
      const next = { ...useIde.getState().expanded };
      delete next[entry.path];
      useIde.setState({ expanded: next });
      return;
    }
    const entries = await loadTree(entry.path);
    useIde.getState().setExpanded(entry.path, entries);
  }

  async function rename() {
    setRenaming(false);
    const next = entry.path.includes("/")
      ? `${entry.path.slice(0, entry.path.lastIndexOf("/"))}/${name}`
      : name;
    if (!name.trim() || next === entry.path) return;
    await fetch("/api/files/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: entry.path, to: next }),
    });
    const tab = useIde.getState().tabs.find((t) => t.path === entry.path);
    if (tab) {
      useIde.getState().evictTab(entry.path);
      await openFile(next);
    }
    useIde.getState().remapBreakpoints(entry.path, next);
    await refreshRoot();
  }

  return (
    <div>
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          onContext(e, entry);
        }}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[14px] hover:bg-hover",
          activePath === entry.path && "bg-teal/10 text-teal",
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <button type="button" onClick={() => void toggle()} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {isDir ? (
            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted transition", open && "rotate-90")} />
          ) : (
            <span className="w-3.5" />
          )}
          {isDir ? (
            open ? <FolderOpen className="h-4 w-4 shrink-0 text-gold/80" /> : <Folder className="h-4 w-4 shrink-0 text-gold/70" />
          ) : (
            <FileGlyph name={entry.name} />
          )}
          {renaming ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void rename()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void rename();
                if (e.key === "Escape") setRenaming(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded border border-line bg-bg px-1 py-0.5 font-mono text-[13px] outline-none"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          )}
        </button>
        <Pencil
          className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 hover:text-text group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setRenaming(true);
          }}
        />
      </div>
      {isDir && open && expanded?.map((child) => (
        <Node key={child.path} entry={child} depth={depth + 1} onContext={onContext} />
      ))}
    </div>
  );
}

function ExplorerEmpty({
  hasFolder,
  onNewFile,
}: {
  hasFolder: boolean;
  onNewFile: () => void;
}) {
  const [path, setPath] = useState("");

  if (!hasFolder) {
    return (
      <div className="px-3 py-4">
        <p className="text-[13px] font-medium">No folder opened</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          Open a folder to browse and edit files.
        </p>
        <button
          type="button"
          onClick={() => void openFolder()}
          className="mt-3 w-full rounded-lg bg-teal/15 px-3 py-1.5 text-[13px] text-teal hover:bg-teal/25"
        >
          Open Folder
        </button>
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (path.trim()) void openFolder(path.trim());
          }}
        >
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="Or paste a folder path"
            className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-[12px] outline-none focus:border-teal/40"
          />
        </form>
        <p className="mt-2.5 flex items-center gap-1 text-[11px] text-muted">
          <Kbd>Ctrl+K</Kbd>
          <span>then</span>
          <Kbd>O</Kbd>
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-4">
      <p className="text-[13px] font-medium">This folder is empty</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Create a file to get started.
      </p>
      <button
        type="button"
        onClick={onNewFile}
        className="mt-3 w-full rounded-lg border border-line bg-bg-2 px-3 py-1.5 text-[13px] hover:bg-hover"
      >
        New file
      </button>
    </div>
  );
}

export function FileTree() {
  const tree = useIde((s) => s.tree);
  const workspace = useIde((s) => s.settings?.workspace);
  const hasFolder = useIde((s) => s.settings?.hasFolder) ?? tree.length > 0;
  const [creating, setCreating] = useState<"file" | "dir" | null>(null);
  const [name, setName] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; entry: TreeEntry } | null>(null);

  async function create() {
    if (!creating || !name.trim()) return;
    const path = name.trim().replace(/\\/g, "/");
    if (creating === "dir") {
      await fetch("/api/files/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    } else {
      await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: "" }),
      });
      await openFile(path);
    }
    setCreating(null);
    setName("");
    await refreshRoot();
  }

  async function remove(entry: TreeEntry) {
    if (!confirm(`Delete ${entry.path}?`)) return;
    await fetch("/api/files/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: entry.path }),
    });
    useIde.getState().evictTab(entry.path);
    useIde.getState().clearBreakpoints(entry.path);
    setMenu(null);
    await refreshRoot();
  }

  return (
    <div className="flex h-full flex-col" onClick={() => setMenu(null)}>
      <PanelHeading
        kicker="Explorer"
        title={hasFolder && tree.length > 0 ? workspace?.split(/[/\\]/).pop() : undefined}
        actions={
          hasFolder ? (
            <>
              <IconButton title="New file" onClick={() => setCreating("file")}>
                <Plus className="h-4 w-4" />
              </IconButton>
              <IconButton title="New folder" onClick={() => setCreating("dir")}>
                <Folder className="h-4 w-4" />
              </IconButton>
              <IconButton title="Refresh" onClick={() => void refreshRoot()}>
                <RefreshCw className="h-4 w-4" />
              </IconButton>
            </>
          ) : undefined
        }
      />
      {creating && (
        <form
          className="px-2 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (!name) setCreating(null);
            }}
            placeholder={creating === "dir" ? "folder/path" : "src/file.ts"}
            className="w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-[13px] outline-none focus:border-teal/40"
          />
        </form>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-3">
        {tree.length === 0 && !creating ? (
          <ExplorerEmpty hasFolder={hasFolder} onNewFile={() => setCreating("file")} />
        ) : (
          tree.map((entry) => (
            <Node
              key={entry.path}
              entry={entry}
              depth={0}
              onContext={(e, item) => setMenu({ x: e.clientX, y: e.clientY, entry: item })}
            />
          ))
        )}
      </div>
      {menu && (
        <div
          className="menu-panel fixed z-50 min-w-40"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.entry.type === "file" && (
            <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-hover" onClick={() => { void openFile(menu.entry.path); setMenu(null); }}>
              Open
            </button>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover"
            onClick={() => {
              void navigator.clipboard.writeText(menu.entry.path);
              setMenu(null);
            }}
          >
            Copy path
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-rose hover:bg-hover"
            onClick={() => void remove(menu.entry)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
