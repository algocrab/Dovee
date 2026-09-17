"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useIde } from "@/stores/ide-store";

export function DoveeMark({ className, size = 22 }: { className?: string; size?: number }) {
  const uid = useId().replace(/:/g, "");
  const light = `doveGrad-${uid}`;
  const dark = `doveGradDark-${uid}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="15 10 210 160"
      width={size}
      height={size * 0.76}
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Dovee"
    >
      <title>Dovee</title>
      <defs>
        <linearGradient id={light} x1="20%" y1="15%" x2="90%" y2="85%">
          <stop offset="0%" stopColor="#6C63FF" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
        <linearGradient id={dark} x1="20%" y1="15%" x2="90%" y2="85%">
          <stop offset="0%" stopColor="#5347E0" />
          <stop offset="100%" stopColor="#1FA1E0" />
        </linearGradient>
      </defs>
      <polygon points="210,95 185,78 140,85 70,115 35,140 75,132 130,150 178,108" fill={`url(#${light})`} />
      <polygon points="140,85 90,25 155,120" fill={`url(#${light})`} />
      <polygon points="155,120 90,25 120,100" fill={`url(#${dark})`} />
      <circle cx="190" cy="90" r="3.4" fill="#12131A" />
    </svg>
  );
}

export function DoveeWordmark({ className, height = 26 }: { className?: string; height?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <DoveeMark size={height} />
      <span className="font-semibold tracking-tight" style={{ fontSize: Math.round(height * 0.58) }}>
        dovee
      </span>
    </span>
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
      <DoveeWordmark height={56} />
      <div>
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
