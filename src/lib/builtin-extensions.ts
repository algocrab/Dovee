import type { ExtensionManifest } from "@/types/extension";

const MIDNIGHT_CSS = `
  --bg: #070b14;
  --bg-1: #0b1220;
  --bg-2: #111a2b;
  --bg-3: #18233a;
  --line: rgba(148, 197, 255, 0.12);
  --text: #d7e4ff;
  --muted: #7f93b5;
  --teal: #5eead4;
  --gold: #93c5fd;
  --rose: #fb7185;
  --green: #86efac;
  --hover: rgba(215, 228, 255, 0.08);
  --overlay: rgba(7, 11, 20, 0.6);
  --editor-bg: #080e1a;
  --shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
`;

function ph(n: number, name: string) {
  return `\${${n}:${name}}`;
}

export function builtinManifests(): ExtensionManifest[] {
  return [
    {
      id: "dovee.hello",
      name: "Hello Dovee",
      version: "1.0.0",
      description: "Command pack. Says hello on the status bar — the smallest Dovee extension.",
      publisher: "dovee",
      contributes: {
        commands: [{ id: "dovee.hello.say", title: "Hello: Say Hello", message: "Hello from the Hello Dovee extension" }],
      },
    },
    {
      id: "dovee.midnight",
      name: "Midnight Teal",
      version: "1.0.0",
      description: "Theme pack. Applies a deep navy chrome + editor palette.",
      publisher: "dovee",
      contributes: {
        commands: [{ id: "dovee.midnight.apply", title: "Theme: Midnight Teal", themeId: "midnight", message: "Theme: Midnight Teal" }],
        themes: [
          {
            id: "midnight",
            label: "Midnight Teal",
            css: MIDNIGHT_CSS,
            editor: {
              background: "#080e1a",
              foreground: "#d7e4ff",
              cursor: "#5eead4",
              selection: "#5eead433",
              lineNumber: "#3d5a80",
            },
          },
        ],
      },
    },
    {
      id: "dovee.snippets",
      name: "JS/TS Snippets",
      version: "1.0.0",
      description: "Snippet pack. Type log, fn, rfc, or imr in a JS/TS file and accept the suggestion.",
      publisher: "dovee",
      contributes: {
        snippets: [
          { prefix: "log", body: "console.log($1);", description: "console.log", language: "javascript" },
          { prefix: "log", body: "console.log($1);", description: "console.log", language: "typescript" },
          { prefix: "fn", body: `function ${ph(1, "name")}(${ph(2, "args")}) {\n  $0\n}`, description: "function", language: "javascript" },
          { prefix: "fn", body: `function ${ph(1, "name")}(${ph(2, "args")}) {\n  $0\n}`, description: "function", language: "typescript" },
          { prefix: "rfc", body: `export function ${ph(1, "Name")}() {\n  return ($0);\n}`, description: "React function component", language: "typescript" },
          { prefix: "imr", body: 'import { $1 } from "react";', description: "import from react", language: "typescript" },
          { prefix: "cl", body: `console.log(${ph(1, "value")});`, description: "console.log alias", language: "javascript" },
          { prefix: "cl", body: `console.log(${ph(1, "value")});`, description: "console.log alias", language: "typescript" },
        ],
      },
    },
    {
      id: "dovee.todo",
      name: "Todo Marker",
      version: "1.0.0",
      description: "Editor command + keybinding. Inserts // TODO: at the cursor (Alt+T).",
      publisher: "dovee",
      contributes: {
        commands: [{ id: "dovee.todo.insert", title: "Insert TODO comment", insert: "// TODO: ", message: "Inserted TODO comment" }],
        keybindings: [{ command: "dovee.todo.insert", key: "alt+t" }],
      },
    },
  ];
}
