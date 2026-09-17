"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useIde } from "@/stores/ide-store";

export function MonacoPane() {
  const tabs = useIde((s) => s.tabs);
  const activePath = useIde((s) => s.activePath);
  const updateContent = useIde((s) => s.updateContent);
  const setCursor = useIde((s) => s.setCursor);
  const tab = tabs.find((t) => t.path === activePath);

  const onMount: OnMount = (editor, monaco) => {
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
        "editorIndentGuide.background": "#ffffff0c",
      },
    });
    monaco.editor.setTheme("dovee-dark");
    editor.onDidChangeCursorPosition((e) => {
      setCursor(e.position.lineNumber, e.position.column);
    });
  };

  if (!tab) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="text-4xl text-teal/80">✧</div>
        <p className="text-sm text-muted">Open a file from the explorer, or ask Dovee to start building.</p>
        <p className="font-mono text-[11px] text-muted/70">Ctrl+P · files &nbsp; Ctrl+L · agent &nbsp; Ctrl+` · terminal</p>
      </div>
    );
  }

  return (
    <Editor
      key={tab.path}
      height="100%"
      theme="dovee-dark"
      language={tab.language}
      value={tab.content}
      onChange={(value) => updateContent(tab.path, value ?? "")}
      onMount={onMount}
      options={{
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 12 },
        tabSize: 2,
        smoothScrolling: true,
        cursorBlinking: "smooth",
        renderLineHighlight: "line",
        bracketPairColorization: { enabled: true },
      }}
    />
  );
}
