"use client";

import { Columns2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { useIde } from "@/stores/ide-store";
import { closeGroupSafe, closeTabSafe } from "./actions";
import { EditorWelcome, IconButton } from "./chrome";
import { FileGlyph } from "./file-icon";

const MonacoPane = dynamic(() => import("./monaco-pane").then((m) => m.MonacoPane), {
  ssr: false,
  loading: () => <EditorWelcome />,
});

export function EditorWorkspace() {
  const groups = useIde((s) => s.editorGroups);
  const splitRatio = useIde((s) => s.splitRatio);
  const wrapRef = useRef<HTMLDivElement>(null);

  if (groups.length < 2) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1">
        <EditorGroupPane groupId={groups[0]?.id ?? "group-1"} />
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="flex min-h-0 min-w-0 flex-1">
      <div style={{ width: `${splitRatio * 100}%` }} className="relative flex min-h-0 min-w-0 flex-col">
        <EditorGroupPane groupId={groups[0].id} />
        <button
          type="button"
          aria-label="Resize editor groups"
          className="resize-x -right-0.5"
          onMouseDown={(e) => {
            e.preventDefault();
            const box = wrapRef.current?.getBoundingClientRect();
            if (!box) return;
            const move = (ev: MouseEvent) => {
              useIde.getState().setSplitRatio((ev.clientX - box.left) / box.width);
            };
            const up = () => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-line">
        <EditorGroupPane groupId={groups[1].id} />
      </div>
    </div>
  );
}

function EditorGroupPane({ groupId }: { groupId: string }) {
  const group = useIde((s) => s.editorGroups.find((g) => g.id === groupId));
  const tabs = useIde((s) => s.tabs);
  const focusedGroupId = useIde((s) => s.focusedGroupId);
  const groupCount = useIde((s) => s.editorGroups.length);
  if (!group) return <EditorWelcome />;

  const focused = focusedGroupId === group.id;
  const activeTab = tabs.find((tab) => tab.path === group.activePath);
  const crumbs = (activeTab?.sourcePath ?? group.activePath)?.replace(/\\/g, "/").split("/") ?? [];
  const groupTabs = group.paths
    .map((path) => tabs.find((t) => t.path === path))
    .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab));

  function split() {
    const state = useIde.getState();
    if (!state.activePath) {
      state.setStatus("Open a file to split the editor");
      return;
    }
    state.splitEditor();
  }

  return (
    <section
      aria-label={focused ? "Active editor group" : "Editor group"}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onMouseDown={() => {
        if (useIde.getState().focusedGroupId !== groupId) useIde.getState().focusGroup(groupId);
      }}
    >
      <div
        className={cn(
          "flex h-9 items-center border-b border-line",
          focused ? "bg-bg-1" : "bg-bg-1/55",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
          {groupTabs.map((tab) => {
            const dirty = tab.kind !== "diff" && tab.content !== tab.original;
            const active = tab.path === group.activePath;
            const label = (tab.sourcePath ?? tab.path).split("/").pop() ?? tab.path;
            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => useIde.getState().setActive(tab.path, groupId)}
                className={cn(
                  "group flex max-w-[200px] items-center gap-1.5 border-t-2 px-3 py-1.5 font-mono text-[13px]",
                  active && focused
                    ? "border-teal bg-bg text-text"
                    : active
                      ? "border-muted bg-bg/60 text-text"
                      : "border-transparent text-muted hover:bg-hover hover:text-text",
                )}
              >
                <FileGlyph name={label} />
                <span className="truncate">
                  {tab.kind === "diff" ? <span className="text-muted">diff · </span> : null}
                  {label}
                </span>
                {dirty ? <span className="h-1.5 w-1.5 rounded-full bg-gold" /> : null}
                <X
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 rounded-sm hover:bg-hover",
                    active ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-70",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTabSafe(tab.path, groupId);
                  }}
                />
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center border-l border-line px-0.5">
          <IconButton
            title={groupCount < 2 ? "Split Editor Right (Ctrl+\\)" : "Open to the Side (Ctrl+\\)"}
            onClick={split}
          >
            <Columns2 className="h-3.5 w-3.5" />
          </IconButton>
          {groupCount > 1 ? (
            <IconButton title="Close Group" onClick={() => closeGroupSafe(groupId)}>
              <X className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
        </div>
      </div>
      {group.activePath ? (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-line bg-bg-1/80 px-3 py-1 font-mono text-[12px] text-muted">
          {crumbs.map((part, i) => (
            <span key={crumbs.slice(0, i + 1).join("/")} className="flex items-center gap-1">
              {i > 0 ? <span className="text-muted/50">/</span> : null}
              <span className={i === crumbs.length - 1 ? "text-text" : ""}>{part}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <MonacoPane groupId={groupId} />
      </div>
    </section>
  );
}
