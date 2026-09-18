export type ExtensionSource = "builtin" | "workspace";

export type ExtensionCommand = {
  id: string;
  title: string;
  /** Status-bar text when the command has no `main` handler. */
  message?: string;
  /** Insert this text at the editor cursor (client-side). */
  insert?: string;
  /** Apply a contributed theme id. */
  themeId?: string;
};

export type ExtensionSnippet = {
  prefix: string;
  body: string;
  description?: string;
  language: string;
};

export type ExtensionTheme = {
  id: string;
  label: string;
  css: string;
  editor?: {
    background: string;
    foreground: string;
    cursor?: string;
    selection?: string;
    lineNumber?: string;
  };
};

export type ExtensionKeybinding = {
  command: string;
  key: string;
};

export type ExtensionManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  publisher?: string;
  main?: string;
  contributes?: {
    commands?: ExtensionCommand[];
    snippets?: ExtensionSnippet[];
    themes?: ExtensionTheme[];
    keybindings?: ExtensionKeybinding[];
  };
};

export type ExtensionInfo = {
  id: string;
  name: string;
  version: string;
  description: string;
  publisher?: string;
  enabled: boolean;
  source: ExtensionSource;
  folder?: string;
  commands: ExtensionCommand[];
  snippets: ExtensionSnippet[];
  themes: ExtensionTheme[];
  keybindings: ExtensionKeybinding[];
  error?: string;
};

export type ExtensionRunResult = {
  ok: boolean;
  status?: string;
  openPath?: string;
  error?: string;
};
