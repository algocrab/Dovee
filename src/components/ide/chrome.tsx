"use client";

import { File } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useIde } from "@/stores/ide-store";

export function DoveeMark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Dovee"
    >
      <title>Dovee</title>
      <rect width="32" height="32" rx="8" fill="var(--bg-3)" />
      <path
        d="M7 18c6-9 13-10 18-8-4 2-6 6-6 10 4-1 7-1 9 1-6 1-11 4-16 4-4 0-6-3-5-7z"
        fill="var(--teal)"
      />
      <circle cx="22.5" cy="12.5" r="1.2" fill="var(--bg)" />
    </svg>
  );
}

export function IconButton({
  title,
  onClick,
  active,
  className,
  children,
}: {
  title: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 text-muted transition-colors hover:bg-hover hover:text-text",
        active && "bg-hover text-teal",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PanelHeading({
  kicker,
  title,
  actions,
}: {
  kicker: string;
  title?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{kicker}</div>
        {title ? (
          <div className="truncate font-mono text-[13px] text-teal/85" title={title}>
            {title}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-0.5">{actions}</div> : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-bg/50 px-3 py-2 text-left text-[13px] hover:bg-hover"
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-teal" : "bg-bg-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full shadow-sm transition-[left]",
            checked ? "left-4 bg-bg" : "left-0.5 bg-muted",
          )}
        />
      </span>
    </button>
  );
}

const EXT_COLOR: Record<string, string> = {
  ts: "text-teal",
  tsx: "text-teal",
  js: "text-gold",
  jsx: "text-gold",
  mjs: "text-gold",
  cjs: "text-gold",
  json: "text-gold/80",
  css: "text-teal/70",
  md: "text-muted",
  mdx: "text-muted",
  py: "text-green",
  rs: "text-rose",
  go: "text-teal",
  html: "text-gold",
  svg: "text-green",
  png: "text-green",
  yml: "text-rose/80",
  yaml: "text-rose/80",
};

export function FileGlyph({ name }: { name: string }) {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return <File className={cn("h-4 w-4 shrink-0", EXT_COLOR[ext] ?? "text-muted")} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[12px] text-muted shadow-[0_1px_0_var(--line)]">
      {children}
    </kbd>
  );
}

export function StatusSep() {
  return <span className="hidden h-3 w-px bg-line sm:inline-block" />;
}

function openFilePalette() {
  useIde.getState().setCommandOpen(true, "files");
}

function openAgent() {
  useIde.setState({ agentOpen: true });
}

export function EditorWelcome() {
  return (
    <div className="welcome-grid flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <DoveeMark size={52} />
      <div>
        <p className="text-xl font-medium tracking-tight">Dovee</p>
        <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-muted">
          Open a file from the explorer, or ask the agent to build something.
        </p>
      </div>
      <div className="grid max-w-md grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-left text-[13px] text-muted">
        <Kbd>Ctrl+P</Kbd>
        <span>Go to file</span>
        <Kbd>Ctrl+Shift+P</Kbd>
        <span>Command palette</span>
        <Kbd>Ctrl+L</Kbd>
        <span>Agent chat</span>
        <Kbd>Ctrl+`</Kbd>
        <span>Terminal</span>
        <Kbd>Ctrl+,</Kbd>
        <span>Settings</span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={openFilePalette}
          className="rounded-lg border border-line bg-bg-2 px-3 py-1.5 text-[13px] hover:bg-hover"
        >
          Open file
        </button>
        <button type="button" onClick={openAgent} className="rounded-lg bg-teal/15 px-3 py-1.5 text-[13px] text-teal hover:bg-teal/25">
          Ask agent
        </button>
      </div>
    </div>
  );
}
