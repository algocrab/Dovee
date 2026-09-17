"use client";

import {
  File,
  FileCode,
  FileCog,
  FileImage,
  FileJson,
  FileText,
  GitBranch,
  KeyRound,
  ListTodo,
  Lock,
  Package,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] font-bold uppercase leading-none",
        label.length > 2 ? "text-[7px]" : "text-[8px]",
        className,
      )}
      aria-hidden
    >
      {label}
    </span>
  );
}

const SPECIAL: Record<string, { icon: LucideIcon; className: string }> = {
  "package.json": { icon: Package, className: "text-gold" },
  "package-lock.json": { icon: Lock, className: "text-gold/80" },
  "pnpm-lock.yaml": { icon: Lock, className: "text-gold/80" },
  "yarn.lock": { icon: Lock, className: "text-gold/80" },
  ".gitignore": { icon: GitBranch, className: "text-muted" },
  ".gitattributes": { icon: GitBranch, className: "text-muted" },
  ".env": { icon: KeyRound, className: "text-green" },
  ".env.example": { icon: KeyRound, className: "text-green" },
  ".env.local": { icon: KeyRound, className: "text-green" },
  "readme.md": { icon: FileText, className: "text-teal" },
  "agents.md": { icon: FileText, className: "text-teal" },
  "claude.md": { icon: FileText, className: "text-gold" },
  dockerfile: { icon: FileCog, className: "text-teal" },
};

const BADGES: Record<string, { label: string; className: string }> = {
  ts: { label: "TS", className: "bg-[#3178c6] text-white" },
  tsx: { label: "TX", className: "bg-[#3178c6] text-white" },
  js: { label: "JS", className: "bg-[#f7df1e] text-[#323330]" },
  mjs: { label: "JS", className: "bg-[#f7df1e] text-[#323330]" },
  cjs: { label: "JS", className: "bg-[#f7df1e] text-[#323330]" },
  jsx: { label: "JX", className: "bg-[#61dafb] text-[#20232a]" },
  css: { label: "CSS", className: "bg-[#563d7c] text-white" },
  html: { label: "HTML", className: "bg-[#e34f26] text-white" },
  py: { label: "PY", className: "bg-[#3572a5] text-white" },
  rs: { label: "RS", className: "bg-[#dea584] text-[#1a1a1a]" },
  go: { label: "GO", className: "bg-[#00add8] text-white" },
};

const ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  json: { icon: FileJson, className: "text-gold" },
  md: { icon: FileText, className: "text-muted" },
  mdx: { icon: FileText, className: "text-muted" },
  mdc: { icon: FileText, className: "text-muted" },
  txt: { icon: FileText, className: "text-muted" },
  svg: { icon: FileImage, className: "text-green" },
  png: { icon: FileImage, className: "text-green" },
  jpg: { icon: FileImage, className: "text-green" },
  jpeg: { icon: FileImage, className: "text-green" },
  gif: { icon: FileImage, className: "text-green" },
  webp: { icon: FileImage, className: "text-green" },
  ico: { icon: FileImage, className: "text-green" },
  yml: { icon: FileCog, className: "text-rose/80" },
  yaml: { icon: FileCog, className: "text-rose/80" },
  sh: { icon: FileCode, className: "text-green" },
  bash: { icon: FileCode, className: "text-green" },
  ps1: { icon: FileCode, className: "text-green" },
  todo: { icon: ListTodo, className: "text-gold" },
  tsbuildinfo: { icon: FileCog, className: "text-muted" },
};

export function FileGlyph({ name }: { name: string }) {
  const lower = name.toLowerCase();
  const special = SPECIAL[lower];
  if (special) {
    const Icon = special.icon;
    return <Icon className={cn("h-4 w-4 shrink-0", special.className)} />;
  }
  if (lower.startsWith("tsconfig") && lower.endsWith(".json")) {
    return <Badge label="TS" className="bg-[#3178c6] text-white" />;
  }
  if (lower.includes(".config.")) {
    return <FileCog className="h-4 w-4 shrink-0 text-muted" />;
  }
  if (lower.endsWith(".d.ts")) {
    return <Badge label="DTS" className="bg-[#3178c6] text-white" />;
  }

  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  const badge = BADGES[ext];
  if (badge) return <Badge label={badge.label} className={badge.className} />;
  const mapped = ICONS[ext];
  if (mapped) {
    const Icon = mapped.icon;
    return <Icon className={cn("h-4 w-4 shrink-0", mapped.className)} />;
  }
  return <File className="h-4 w-4 shrink-0 text-muted" />;
}
