"use client";

import { ChevronRight, File, Folder, FolderOpen, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useIde, type TreeEntry } from "@/stores/ide-store";

async function loadTree(path = ".") {
  const res = await fetch(`/api/files/tree?path=${encodeURIComponent(path)}`);
  const data = await res.json();
  return (data.entries ?? []) as TreeEntry[];
}

export async function refreshRoot() {
  const entries = await loadTree(".");
  useIde.getState().setTree(entries);
}

export async function openFile(path: string) {
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
}

function Node({ entry, depth }: { entry: TreeEntry; depth: number }) {
  const expanded = useIde((s) => s.expanded[entry.path]);
  const activePath = useIde((s) => s.activePath);
  const isDir = entry.type === "dir";
  const open = Boolean(expanded);

  async function toggle() {
    if (!isDir) {
      await openFile(entry.path);
      return;
    }
    if (open) {
      useIde.getState().setExpanded(entry.path, []);
      const next = { ...useIde.getState().expanded };
      delete next[entry.path];
      useIde.setState({ expanded: next });
      return;
    }
    const entries = await loadTree(entry.path);
    useIde.getState().setExpanded(entry.path, entries);
  }

  async function remove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete ${entry.path}?`)) return;
    await fetch("/api/files/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: entry.path }),
    });
    useIde.getState().closeTab(entry.path);
    await refreshRoot();
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[12.5px] hover:bg-white/5",
          activePath === entry.path && "bg-teal/10 text-teal",
        )}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        {isDir ? (
          <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted transition", open && "rotate-90")} />
        ) : (
          <span className="w-3" />
        )}
        {isDir ? (
          open ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-gold/80" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-gold/70" />
        ) : (
          <File className="h-3.5 w-3.5 shrink-0 text-muted" />
        )}
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        <Trash2
          className="h-3 w-3 shrink-0 text-muted opacity-0 hover:text-rose group-hover:opacity-100"
          onClick={remove}
        />
      </button>
      {isDir && open && expanded?.map((child) => <Node key={child.path} entry={child} depth={depth + 1} />)}
    </div>
  );
}

export function FileTree() {
  const tree = useIde((s) => s.tree);
  const workspace = useIde((s) => s.settings?.workspace);
  const [creating, setCreating] = useState<"file" | "dir" | null>(null);
  const [name, setName] = useState("");

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted">Explorer</div>
          <div className="truncate font-mono text-[11px] text-teal/80" title={workspace}>
            {workspace?.split(/[/\\]/).pop()}
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" className="rounded p-1 text-muted hover:bg-white/5 hover:text-text" onClick={() => setCreating("file")} title="New file">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="rounded p-1 text-muted hover:bg-white/5 hover:text-text" onClick={() => setCreating("dir")} title="New folder">
            <Folder className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="rounded p-1 text-muted hover:bg-white/5 hover:text-text" onClick={() => refreshRoot()} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
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
            className="w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-xs outline-none focus:border-teal/40"
          />
        </form>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-3">
        {tree.map((entry) => (
          <Node key={entry.path} entry={entry} depth={0} />
        ))}
      </div>
    </div>
  );
}
