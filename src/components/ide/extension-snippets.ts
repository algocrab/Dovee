import type { editor, IDisposable, languages } from "monaco-editor";
import type { ExtensionInfo } from "@/types/extension";

type Monaco = typeof import("monaco-editor");

let snippetDisposables: IDisposable[] = [];

export function syncExtensionSnippets(monaco: Monaco, extensions: ExtensionInfo[]) {
  for (const item of snippetDisposables) item.dispose();
  snippetDisposables = [];
  const byLang = new Map<string, ExtensionInfo["snippets"]>();
  for (const ext of extensions) {
    if (!ext.enabled) continue;
    for (const snippet of ext.snippets) {
      const list = byLang.get(snippet.language) ?? [];
      list.push(snippet);
      byLang.set(snippet.language, list);
    }
  }
  for (const [language, snippets] of byLang) {
    snippetDisposables.push(
      monaco.languages.registerCompletionItemProvider(language, {
        provideCompletionItems(model, position) {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          const suggestions: languages.CompletionItem[] = snippets.map((snippet) => ({
            label: snippet.prefix,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: snippet.body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: snippet.description ?? snippet.prefix,
            range,
          }));
          return { suggestions };
        },
      }),
    );
  }
}

export function applyExtensionEditorTheme(
  monaco: Monaco,
  extensions: ExtensionInfo[],
  themeId: string | null,
  fallback: string,
) {
  if (!themeId) {
    monaco.editor.setTheme(fallback);
    return;
  }
  const pack = extensions
    .filter((ext) => ext.enabled)
    .flatMap((ext) => ext.themes)
    .find((theme) => theme.id === themeId);
  if (!pack?.editor) {
    monaco.editor.setTheme(fallback);
    return;
  }
  const name = `ext-${pack.id}`;
  monaco.editor.defineTheme(name, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": pack.editor.background,
      "editor.foreground": pack.editor.foreground,
      "editorCursor.foreground": pack.editor.cursor ?? pack.editor.foreground,
      "editor.selectionBackground": pack.editor.selection ?? "#5eead433",
      "editorLineNumber.foreground": pack.editor.lineNumber ?? "#4a4954",
      "editorLineNumber.activeForeground": pack.editor.cursor ?? pack.editor.foreground,
    },
  });
  monaco.editor.setTheme(name);
}

export function insertAtCursor(editor: editor.IStandaloneCodeEditor, text: string) {
  const pos = editor.getPosition();
  if (!pos) return;
  editor.executeEdits("dovee-ext", [
    {
      range: {
        startLineNumber: pos.lineNumber,
        startColumn: pos.column,
        endLineNumber: pos.lineNumber,
        endColumn: pos.column,
      },
      text,
    },
  ]);
  editor.focus();
}
