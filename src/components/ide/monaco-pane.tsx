"use client";

import Editor, { DiffEditor, loader, type OnMount } from "@monaco-editor/react";
import type { languages } from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { MONACO_THEME, type ThemeId } from "@/lib/theme";
import { useIde } from "@/stores/ide-store";
import { formatTab } from "./actions";
import { toggleBreakpointAt } from "./debug-actions";
import { AddToChatButton, type ChatSpot } from "./add-to-chat";
import { EditorWelcome } from "./chrome";

// Serve Monaco from our own bundle instead of the jsDelivr CDN the loader defaults to,
// so the editor also works offline. scripts/sync-monaco.cjs populates public/monaco.
loader.config({ paths: { vs: "/monaco/vs" } });

type TypeResponse = {
  ok: boolean;
  compilerOptions?: languages.typescript.CompilerOptions;
  libs?: { path: string; text: string }[];
  stats?: { packages: number; files: number; bytes: number; skipped: number };
};

const loadedPackages = new Set<string>();
const loadedLibPaths = new Set<string>();
let baseTypesPromise: Promise<TypeResponse> | null = null;
let baseTypesReady = false;

/** Same rules as the server-side extractor — keep them in sync. */
function extractPackageImports(source: string): string[] {
  const found = new Set<string>();
  const re =
    /(?:import|export)(?:[\s\S]*?from\s*|[\s]*|[\s]+type[\s\S]*?from\s*)["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const spec = match[1] || match[2] || match[3];
    if (!spec) continue;
    if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("@/")) continue;
    const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    if (pkg) found.add(pkg);
  }
  return [...found];
}

function applyLibs(monaco: Parameters<OnMount>[1], libs: { path: string; text: string }[]) {
  const defaults = monaco.languages.typescript.typescriptDefaults;
  const jsDefaults = monaco.languages.typescript.javascriptDefaults;
  for (const lib of libs) {
    if (loadedLibPaths.has(lib.path)) continue;
    loadedLibPaths.add(lib.path);
    defaults.addExtraLib(lib.text, lib.path);
    jsDefaults.addExtraLib(lib.text, lib.path);
  }
}

async function ensureBaseTypes(monaco: Parameters<OnMount>[1]) {
  if (baseTypesReady) return;
  if (!baseTypesPromise) {
    baseTypesPromise = fetch("/api/types")
      .then((res) => res.json() as Promise<TypeResponse>)
      .catch(() => {
        baseTypesPromise = null;
        return { ok: false } as TypeResponse;
      });
  }
  const data = await baseTypesPromise;
  if (!data.ok) return;
  const defaults = monaco.languages.typescript.typescriptDefaults;
  const jsDefaults = monaco.languages.typescript.javascriptDefaults;
  if (data.compilerOptions) {
    const opts = { ...data.compilerOptions, allowNonTsExtensions: true };
    defaults.setCompilerOptions(opts);
    jsDefaults.setCompilerOptions(opts);
  }
  applyLibs(monaco, data.libs ?? []);
  defaults.setEagerModelSync(true);
  jsDefaults.setEagerModelSync(true);
  // Essentials are already in the base bundle.
  for (const name of ["@types/node", "@types/react", "@types/react-dom", "csstype", "react", "react-dom"]) {
    loadedPackages.add(name);
  }
  baseTypesReady = true;
}

async function loadPackageTypes(monaco: Parameters<OnMount>[1], packages: string[]) {
  const needed = packages.filter((name) => !loadedPackages.has(name));
  if (needed.length === 0) return;
  // Mark eagerly so concurrent scans do not re-request the same package.
  for (const name of needed) loadedPackages.add(name);
  try {
    const res = await fetch("/api/types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packages: needed }),
    });
    const data = (await res.json()) as TypeResponse;
    if (!data.ok) {
      for (const name of needed) loadedPackages.delete(name);
      return;
    }
    applyLibs(monaco, data.libs ?? []);
  } catch {
    for (const name of needed) loadedPackages.delete(name);
  }
}

// Base types on mount, then on-demand package types from the open buffer's imports.
// That keeps the initial payload small (~project + React/Node) instead of every
// dependency's .d.ts (which was 13 MB for this repo alone).
async function loadTypeLibs(monaco: Parameters<OnMount>[1]) {
  await ensureBaseTypes(monaco);
}

function schedulePackageScan(monaco: Parameters<OnMount>[1], source: string) {
  const packages = extractPackageImports(source);
  if (packages.length === 0) return;
  void loadPackageTypes(monaco, packages);
}

function appearanceOptions(fontSize: number, wordWrap: boolean, minimap: boolean) {
  return {
    fontSize,
    lineHeight: Math.round(fontSize * 1.55),
    minimap: { enabled: minimap },
    wordWrap: (wordWrap ? "on" : "off") as "on" | "off",
    glyphMargin: true,
  };
}

function defineThemes(monaco: Parameters<OnMount>[1]) {
  monaco.editor.defineTheme("dovee-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6b6876", fontStyle: "italic" },
      { token: "string", foreground: "e4b86a" },
      { token: "keyword", foreground: "7dd3c0" },
      { token: "number", foreground: "e07a7a" },
    ],
    colors: {
      "editor.background": "#0c0d12",
      "editor.foreground": "#e8e4dc",
      "editorLineNumber.foreground": "#4a4954",
      "editorLineNumber.activeForeground": "#7dd3c0",
      "editor.selectionBackground": "#7dd3c033",
      "editor.lineHighlightBackground": "#ffffff06",
      "editorCursor.foreground": "#7dd3c0",
      "editorWidget.background": "#13141c",
      "editorWidget.border": "#23242f",
    },
  });
  monaco.editor.defineTheme("dovee-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7a746c", fontStyle: "italic" },
      { token: "string", foreground: "9a3412" },
      { token: "keyword", foreground: "0f766e" },
      { token: "number", foreground: "b42318" },
    ],
    colors: {
      "editor.background": "#fffcf7",
      "editor.foreground": "#1c1916",
      "editorLineNumber.foreground": "#9a9388",
      "editorLineNumber.activeForeground": "#0f766e",
      "editor.selectionBackground": "#0f766e22",
      "editor.lineHighlightBackground": "#1c191608",
      "editorCursor.foreground": "#0f766e",
      "editorWidget.background": "#ffffff",
      "editorWidget.border": "#e7e0d6",
    },
  });
  monaco.editor.defineTheme("dovee-dusk", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8a7464", fontStyle: "italic" },
      { token: "string", foreground: "f0c27a" },
      { token: "keyword", foreground: "e8a87c" },
      { token: "number", foreground: "e07a7a" },
    ],
    colors: {
      "editor.background": "#1a1512",
      "editor.foreground": "#f3e6d4",
      "editorLineNumber.foreground": "#6e5c4e",
      "editorLineNumber.activeForeground": "#e8a87c",
      "editor.selectionBackground": "#e8a87c33",
      "editor.lineHighlightBackground": "#ffffff06",
      "editorCursor.foreground": "#e8a87c",
      "editorWidget.background": "#271f19",
      "editorWidget.border": "#3a2e24",
    },
  });
}

export function MonacoPane({ groupId }: { groupId: string }) {
  const tabs = useIde((s) => s.tabs);
  const group = useIde((s) => s.editorGroups.find((g) => g.id === groupId));
  const updateContent = useIde((s) => s.updateContent);
  const setCursor = useIde((s) => s.setCursor);
  const reveal = useIde((s) => s.reveal);
  const theme = (useIde((s) => s.settings?.theme) ?? "dark") as ThemeId;
  const fontSize = useIde((s) => s.settings?.editorFontSize ?? 15);
  const wordWrap = useIde((s) => s.settings?.wordWrap ?? true);
  const minimap = useIde((s) => s.settings?.minimap ?? false);
  const tab = tabs.find((t) => t.path === group?.activePath);
  const breakpoints = useIde((s) => s.breakpoints);
  const debugPaused = useIde((s) => s.debugPaused);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const appliedReveal = useRef<{ editor: unknown; nonce: number } | null>(null);
  const pathRef = useRef<string | null>(tab?.path ?? null);
  const decoRef = useRef<string[]>([]);
  const [spot, setSpot] = useState<ChatSpot | null>(null);
  const [editorGen, setEditorGen] = useState(0);

  // The editor's selection callbacks run outside React, so the path is kept in a ref.
  useEffect(() => {
    pathRef.current = tab?.path ?? null;
  }, [tab?.path]);

  /**
   * One-shot reveal: jump to the line a caller asked for, but only if the request
   * targets the tab that is actually active. Guarded per editor instance so a
   * pending jump survives the remount that a tab switch triggers.
   */
  const applyReveal = useCallback(() => {
    const editor = editorRef.current;
    const path = pathRef.current;
    if (!editor || !path) return;
    const request = useIde.getState().reveal;
    if (!request || request.path !== path) return;
    const applied = appliedReveal.current;
    if (applied && applied.editor === editor && applied.nonce === request.nonce) return;
    appliedReveal.current = { editor, nonce: request.nonce };
    editor.revealLineInCenter(request.line);
    editor.setPosition({ lineNumber: request.line, column: Math.max(1, request.column || 1) });
    if (useIde.getState().focusedGroupId === groupId) editor.focus();
  }, [groupId]);

  // Whenever the active buffer changes (tab switch or edit), pull types for any
  // new bare imports it references. Already-loaded packages are a no-op.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !tab) return;
    if (tab.kind === "diff") return;
    const content = tab.content;
    void ensureBaseTypes(monaco).then(() => {
      schedulePackageScan(monaco, content);
    });
  }, [tab]);

  useEffect(() => {
    monacoRef.current?.editor.setTheme(MONACO_THEME[theme]);
  }, [theme]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions(appearanceOptions(fontSize, wordWrap, minimap));
  }, [fontSize, wordWrap, minimap]);

  const groupCount = useIde((s) => s.editorGroups.length);
  const splitRatio = useIde((s) => s.splitRatio);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => editorRef.current?.layout());
    return () => window.cancelAnimationFrame(frame);
  }, [groupCount, splitRatio]);

  // Jump when Search / Problems / go-to raises a reveal request for this file.
  // Tracked per editor instance so a remount (tab switch) still lands the jump.
  useEffect(() => {
    applyReveal();
  }, [reveal, tab?.path, applyReveal]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !tab || tab.kind === "diff") return;
    const next = [];
    for (const bp of breakpoints) {
      if (bp.path !== tab.path || !bp.enabled) continue;
      next.push({
        range: new monaco.Range(bp.line, 1, bp.line, 1),
        options: {
          glyphMarginClassName: "dovee-bp",
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    }
    if (debugPaused && debugPaused.path === tab.path) {
      next.push({
        range: new monaco.Range(debugPaused.line, 1, debugPaused.line, 1),
        options: {
          isWholeLine: true,
          className: "dovee-debug-line",
          glyphMarginClassName: "dovee-debug-pos",
        },
      });
    }
    decoRef.current = editor.deltaDecorations(decoRef.current, next);
  }, [breakpoints, debugPaused, tab, editorGen]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setEditorGen((n) => n + 1);
    defineThemes(monaco);
    monaco.editor.setTheme(MONACO_THEME[theme]);
    editor.updateOptions(appearanceOptions(fontSize, wordWrap, minimap));
    void loadTypeLibs(monaco).then(() => {
      const model = editor.getModel();
      if (model) schedulePackageScan(monaco, model.getValue());
    });
    applyReveal();

    editor.onDidFocusEditorText(() => {
      useIde.getState().focusGroup(groupId);
      const pos = editor.getPosition();
      if (pos) setCursor(pos.lineNumber, pos.column);
    });

    // Monaco's own Format Document has no provider registered, so route Shift+Alt+F
    // through the same server-side prettier that backs format-on-save.
    editor.addAction({
      id: "dovee.formatDocument",
      label: "Format Document",
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: () => {
        const path = pathRef.current;
        if (!path) return;
        void formatTab(path).then((result) => {
          const { setStatus } = useIde.getState();
          if (!result.ok) {
            setStatus(result.error ?? "Could not format this file");
            return;
          }
          setStatus(result.changed ? `Formatted ${path}` : `${path} is already formatted`);
        });
      },
    });

    editor.onMouseDown((e) => {
      const kinds = monaco.editor.MouseTargetType;
      const inGutter =
        e.target.type === kinds.GUTTER_GLYPH_MARGIN ||
        e.target.type === kinds.GUTTER_LINE_NUMBERS ||
        e.target.type === kinds.GUTTER_LINE_DECORATIONS;
      if (!inGutter) return;
      const line = e.target.position?.lineNumber ?? e.target.range?.startLineNumber;
      const path = pathRef.current;
      if (path && line) toggleBreakpointAt(path, line);
    });

    const showSelectionAction = () => {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (!selection || selection.isEmpty() || !model) {
        setSpot(null);
        return;
      }
      const text = model.getValueInRange(selection);
      if (!text.trim()) {
        setSpot(null);
        return;
      }
      const dom = editor.getDomNode();
      const end = editor.getScrolledVisiblePosition(selection.getEndPosition());
      if (!dom || !end) {
        setSpot(null);
        return;
      }
      const box = dom.getBoundingClientRect();
      const startLine = selection.getStartPosition().lineNumber;
      const endLine = selection.getEndPosition().lineNumber;
      const path = pathRef.current;
      const label = path
        ? `\`${path}\` (${startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`})`
        : undefined;
      const anchorTop = box.top + end.top;
      const below = anchorTop - box.top < 40;
      const half = 70;
      const minX = box.left + half;
      const maxX = Math.max(minX, box.right - half);
      setSpot({
        x: Math.min(Math.max(box.left + end.left, minX), maxX),
        y: below ? anchorTop + end.height + 6 : anchorTop - 6,
        below,
        text,
        label,
      });
    };

    editor.onDidChangeCursorSelection(showSelectionAction);
    editor.onDidScrollChange(() => setSpot(null));
    editor.onDidChangeCursorPosition((e) => {
      if (useIde.getState().focusedGroupId === groupId) {
        setCursor(e.position.lineNumber, e.position.column);
      }
    });
    editor.onDidDispose(() => {
      if (editorRef.current === editor) editorRef.current = null;
      // The Editor is keyed by path, so a tab switch disposes it and clears the popup here.
      setSpot(null);
    });
  };

  if (!tab) {
    return <EditorWelcome />;
  }

  if (tab.kind === "diff") {
    return (
      <DiffEditor
        key={tab.path}
        height="100%"
        theme={MONACO_THEME[theme]}
        language={tab.language}
        original={tab.original}
        modified={tab.content}
        options={{
          readOnly: true,
          renderSideBySide: true,
          useInlineViewWhenSpaceIsLimited: false,
          originalEditable: false,
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          ...appearanceOptions(fontSize, wordWrap, false),
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 12 },
          renderOverviewRuler: false,
        }}
      />
    );
  }

  return (
    <>
      <Editor
        height="100%"
        theme={MONACO_THEME[theme]}
        language={tab.language}
        path={`file:///${tab.path}`}
        value={tab.content}
        keepCurrentModel
        onChange={(value) => updateContent(tab.path, value ?? "")}
        onMount={onMount}
        options={{
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          ...appearanceOptions(fontSize, wordWrap, minimap),
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 12 },
          tabSize: 2,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          renderLineHighlight: "line",
          bracketPairColorization: { enabled: true },
          formatOnPaste: true,
        }}
      />
      {spot ? <AddToChatButton spot={spot} onDone={() => setSpot(null)} /> : null}
    </>
  );
}
