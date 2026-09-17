"use client";

import { useEffect, useState } from "react";
import { closeAllTabs, closeTabSafe, createNewFile, persistAppearance, saveAll, saveTab } from "./actions";
import { useDesktopApp } from "@/lib/desktop";
import { useIde } from "@/stores/ide-store";

const MENUS = ["File", "Edit", "View", "Go", "Terminal", "Help"] as const;

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const close = () => setOpen(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="flex items-center gap-0.5 text-[13px]">
      {MENUS.map((name) => (
        <div key={name} className="relative" onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`rounded px-2 py-1 hover:bg-hover ${open === name ? "bg-hover" : ""}`}
            onClick={() => setOpen((v) => (v === name ? null : name))}
            onMouseEnter={() => {
              if (open) setOpen(name);
            }}
          >
            {name}
          </button>
          {open === name && <Menu name={name} onDone={() => setOpen(null)} />}
        </div>
      ))}
    </div>
  );
}

function Item({
  label,
  kbd,
  onClick,
}: {
  label: string;
  kbd?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-teal/10"
      onClick={onClick}
    >
      <span>{label}</span>
      {kbd && <span className="font-mono text-[12px] text-muted">{kbd}</span>}
    </button>
  );
}

function Menu({ name, onDone }: { name: string; onDone: () => void }) {
  const run = (fn: () => unknown | Promise<unknown>) => {
    void fn();
    onDone();
  };
  const s = useIde.getState();

  if (name === "File") {
    return (
      <div className="menu-panel absolute left-0 top-full z-40 mt-1">
        <Item label="New File" kbd="Ctrl+N" onClick={() => run(createNewFile)} />
        <hr className="my-1 border-line" />
        <Item label="Save" kbd="Ctrl+S" onClick={() => run(() => s.activePath && saveTab(s.activePath))} />
        <Item label="Save All" kbd="Ctrl+K S" onClick={() => run(saveAll)} />
        <hr className="my-1 border-line" />
        <Item label="Close Editor" kbd="Ctrl+W" onClick={() => run(() => s.activePath && closeTabSafe(s.activePath))} />
        <Item label="Close All" onClick={() => run(closeAllTabs)} />
        <hr className="my-1 border-line" />
        <Item label="Settings" kbd="Ctrl+," onClick={() => run(() => s.setSettingsOpen(true))} />
      </div>
    );
  }
  if (name === "Edit") {
    return (
      <div className="menu-panel absolute left-0 top-full z-40 mt-1">
        <Item label="Find" kbd="Ctrl+F" onClick={() => run(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true })))} />
        <Item label="Find in Files" kbd="Ctrl+Shift+F" onClick={() => run(() => s.setLeftTab("search"))} />
      </div>
    );
  }
  if (name === "View") {
    return (
      <div className="menu-panel absolute left-0 top-full z-40 mt-1">
        <Item label="Explorer" kbd="Ctrl+Shift+E" onClick={() => run(() => s.setLeftTab("explorer"))} />
        <Item label="Search" kbd="Ctrl+Shift+F" onClick={() => run(() => s.setLeftTab("search"))} />
        <Item label="Source Control" kbd="Ctrl+Shift+G" onClick={() => run(() => s.setLeftTab("git"))} />
        <Item label="Terminal" kbd="Ctrl+`" onClick={() => run(() => s.toggleTerminal())} />
        <Item label="Agent" kbd="Ctrl+L" onClick={() => run(() => s.toggleAgent())} />
        <Item label="Problems" onClick={() => run(() => s.setBottomTab("problems"))} />
        <hr className="my-1 border-line" />
        <Item label="Theme: Dark" onClick={() => run(() => persistAppearance({ theme: "dark" }))} />
        <Item label="Theme: Light" onClick={() => run(() => persistAppearance({ theme: "light" }))} />
        <Item label="Theme: Dusk" onClick={() => run(() => persistAppearance({ theme: "dusk" }))} />
      </div>
    );
  }
  if (name === "Go") {
    return (
      <div className="menu-panel absolute left-0 top-full z-40 mt-1">
        <Item label="Go to File" kbd="Ctrl+P" onClick={() => run(() => s.setCommandOpen(true, "files"))} />
        <Item label="Command Palette" kbd="Ctrl+Shift+P" onClick={() => run(() => s.setCommandOpen(true, "commands"))} />
      </div>
    );
  }
  if (name === "Terminal") {
    return (
      <div className="menu-panel absolute left-0 top-full z-40 mt-1">
        <Item label="New Terminal" onClick={() => run(() => s.addTerminal())} />
        <Item label="Toggle Terminal" kbd="Ctrl+`" onClick={() => run(() => s.toggleTerminal())} />
      </div>
    );
  }
  return (
    <div className="menu-panel absolute left-0 top-full z-40 mt-1">
      <Item label="Keyboard Shortcuts" onClick={() => run(() => s.setCommandOpen(true, "commands"))} />
      <p className="px-2 py-1.5 text-[12px] text-muted">Dovee IDE · bring your own model API</p>
    </div>
  );
}
