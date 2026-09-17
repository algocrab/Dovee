"use client";

import Editor, { loader, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { MONACO_THEME, type ThemeId } from "@/lib/theme";
import { useIde } from "@/stores/ide-store";
import { AddToChatButton, type ChatSpot } from "./add-to-chat";
import { EditorWelcome } from "./chrome";

// Serve Monaco from our own bundle instead of the jsDelivr CDN the loader defaults to,
// so the editor also works offline. scripts/sync-monaco.cjs populates public/monaco.
loader.config({ paths: { vs: "/monaco/vs" } });

function appearanceOptions(fontSize: number, wordWrap: boolean, minimap: boolean) {
  return {
    fontSize,
    lineHeight: Math.round(fontSize * 1.55),
    minimap: { enabled: minimap },
    wordWrap: (wordWrap ? "on" : "off") as "on" | "off",
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

export function MonacoPane() {
  const tabs = useIde((s) => s.tabs);
  const activePath = useIde((s) => s.activePath);
  const updateContent = useIde((s) => s.updateContent);
  const setCursor = useIde((s) => s.setCursor);
  const theme = (useIde((s) => s.settings?.theme) ?? "dark") as ThemeId;
  const fontSize = useIde((s) => s.settings?.editorFontSize ?? 15);
  const wordWrap = useIde((s) => s.settings?.wordWrap ?? true);
  const minimap = useIde((s) => s.settings?.minimap ?? false);
  const tab = tabs.find((t) => t.path === activePath);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const pathRef = useRef<string | null>(tab?.path ?? null);
  const [spot, setSpot] = useState<ChatSpot | null>(null);

  // The editor's selection callbacks run outside React, so the path is kept in a ref.
  useEffect(() => {
    pathRef.current = tab?.path ?? null;
  }, [tab?.path]);

  useEffect(() => {
    monacoRef.current?.editor.setTheme(MONACO_THEME[theme]);
  }, [theme]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions(appearanceOptions(fontSize, wordWrap, minimap));
  }, [fontSize, wordWrap, minimap]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    defineThemes(monaco);
    monaco.editor.setTheme(MONACO_THEME[theme]);
    editor.updateOptions(appearanceOptions(fontSize, wordWrap, minimap));
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
      setCursor(e.position.lineNumber, e.position.column);
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

  return (
    <>
      <Editor
        key={tab.path}
        height="100%"
        theme={MONACO_THEME[theme]}
        language={tab.language}
        value={tab.content}
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
      {spot && <AddToChatButton spot={spot} onDone={() => setSpot(null)} />}
    </>
  );
}
