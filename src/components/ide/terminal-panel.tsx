"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { XTERM_THEMES, type ThemeId } from "@/lib/theme";
import { useIde } from "@/stores/ide-store";

function safeFit(fit: FitAddon | null, host: HTMLElement | null, term: Terminal | null) {
  if (!fit || !host || !term?.element) return;
  if (host.clientWidth < 8 || host.clientHeight < 8) return;
  try {
    fit.fit();
  } catch {
    /* xterm throws if the core is not ready / disposed */
  }
}

function TerminalSession({ id, active }: { id: string; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const buffer = useRef("");
  const fitRef = useRef<FitAddon | null>(null);
  const fontSize = useIde((s) => s.settings?.editorFontSize ?? 15);
  const theme = (useIde((s) => s.settings?.theme) ?? "dark") as ThemeId;

  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({
      convertEol: true,
      fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
      fontSize,
      lineHeight: 1.2,
      theme: XTERM_THEMES[theme],
      cursorBlink: true,
    });
    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);
    term.open(host.current);
    termRef.current = term;
    requestAnimationFrame(() => safeFit(fit, host.current, term));

    const es = new EventSource(`/api/terminal?id=${encodeURIComponent(id)}`);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { text?: string };
        if (data.text) term.write(data.text);
      } catch {
        /* ignore */
      }
    };

    term.onData((data) => {
      if (data === "\r") {
        term.write("\r\n");
        void fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, data: `${buffer.current}\n` }),
        });
        buffer.current = "";
        return;
      }
      if (data === "\u007f") {
        if (!buffer.current) return;
        buffer.current = buffer.current.slice(0, -1);
        term.write("\b \b");
        return;
      }
      if (data === "\u0003") {
        buffer.current = "";
        term.write("^C\r\n");
        void fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, data: "\u0003" }),
        });
        return;
      }
      buffer.current += data;
      term.write(data);
    });

    const onResize = () => safeFit(fit, host.current, term);
    window.addEventListener("resize", onResize);
    const observer = new ResizeObserver(onResize);
    observer.observe(host.current);

    return () => {
      es.close();
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // theme/fontSize applied in a separate effect so we don't dispose on toggle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = XTERM_THEMES[theme];
    term.options.fontSize = fontSize;
    requestAnimationFrame(() => safeFit(fitRef.current, host.current, term));
  }, [theme, fontSize]);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => safeFit(fitRef.current, host.current, termRef.current));
      termRef.current?.focus();
    }
  }, [active]);

  return <div ref={host} className={cn("min-h-0 flex-1", !active && "hidden")} />;
}

export function TerminalPanel({ hideHeaderPlus = false }: { hideHeaderPlus?: boolean }) {
  const tabs = useIde((s) => s.termTabs);
  const active = useIde((s) => s.activeTermId);

  async function restart() {
    await fetch("/api/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active, restart: true }),
    });
  }

  async function closeTab(id: string) {
    if (tabs.length <= 1) return;
    await fetch("/api/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, kill: true }),
    });
    useIde.getState().closeTerminal(id);
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex items-center gap-1 px-2 py-0.5">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => useIde.getState().setActiveTerm(tab.id)}
              className={cn(
                "group flex items-center gap-1 rounded px-2 py-1 font-mono text-[11px]",
                tab.id === active ? "bg-hover text-text" : "text-muted hover:bg-hover",
              )}
            >
              {tab.name}
              {tabs.length > 1 && (
                <X
                  className="h-3 w-3 opacity-50 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeTab(tab.id);
                  }}
                />
              )}
            </button>
          ))}
        </div>
        {!hideHeaderPlus && (
          <button
            type="button"
            onClick={() => useIde.getState().addTerminal()}
            className="rounded p-1 text-muted hover:bg-hover hover:text-text"
            title="New terminal"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => void restart()}
          className="rounded p-1 text-muted hover:bg-hover hover:text-text"
          title="Restart shell"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {tabs.map((tab) => (
          <TerminalSession key={tab.id} id={tab.id} active={tab.id === active} />
        ))}
      </div>
    </div>
  );
}
