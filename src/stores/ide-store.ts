import { create } from "zustand";

export type TreeEntry = { name: string; path: string; type: "file" | "dir" };

export type Tab = {
  path: string;
  content: string;
  original: string;
  language: string;
};

export type ToolCard = {
  id: string;
  name: string;
  arguments: string;
  output?: string;
  ok?: boolean;
  status: "running" | "done" | "error";
};

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  tools: ToolCard[];
};

export type PublicSettings = {
  model: "deepseek-flash" | "deepseek-v4-pro";
  reasoningEffort: "none" | "low" | "high" | "max";
  workspace: string;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyHint: string;
};

type SearchHit = { path: string; line: number; text: string };

type IdeState = {
  settings: PublicSettings | null;
  tree: TreeEntry[];
  expanded: Record<string, TreeEntry[]>;
  tabs: Tab[];
  activePath: string | null;
  cursor: { line: number; column: number };
  leftTab: "explorer" | "search";
  agentOpen: boolean;
  terminalOpen: boolean;
  terminalHeight: number;
  agentWidth: number;
  settingsOpen: boolean;
  commandOpen: boolean;
  searchQuery: string;
  searchHits: SearchHit[];
  fileIndex: string[];
  messages: ChatMsg[];
  streaming: boolean;
  status: string;
  setSettings: (s: PublicSettings) => void;
  setTree: (e: TreeEntry[]) => void;
  setExpanded: (path: string, entries: TreeEntry[]) => void;
  setCursor: (line: number, column: number) => void;
  setLeftTab: (t: "explorer" | "search") => void;
  toggleAgent: () => void;
  toggleTerminal: () => void;
  setTerminalHeight: (n: number) => void;
  setAgentWidth: (n: number) => void;
  setSettingsOpen: (v: boolean) => void;
  setCommandOpen: (v: boolean) => void;
  setSearch: (q: string, hits: SearchHit[]) => void;
  setFileIndex: (files: string[]) => void;
  openTab: (tab: Tab) => void;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string) => void;
  reloadTab: (path: string, content: string) => void;
  addUserMessage: (content: string) => string;
  ensureAssistant: () => string;
  appendThinking: (text: string) => void;
  appendContent: (text: string) => void;
  startTool: (card: ToolCard) => void;
  finishTool: (id: string, ok: boolean, output: string) => void;
  setStreaming: (v: boolean) => void;
  setStatus: (s: string) => void;
  newChat: () => void;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useIde = create<IdeState>((set, get) => ({
  settings: null,
  tree: [],
  expanded: {},
  tabs: [],
  activePath: null,
  cursor: { line: 1, column: 1 },
  leftTab: "explorer",
  agentOpen: true,
  terminalOpen: true,
  terminalHeight: 220,
  agentWidth: 380,
  settingsOpen: false,
  commandOpen: false,
  searchQuery: "",
  searchHits: [],
  fileIndex: [],
  messages: [],
  streaming: false,
  status: "Ready",
  setSettings: (settings) => set({ settings }),
  setTree: (tree) => set({ tree }),
  setExpanded: (path, entries) =>
    set((s) => ({ expanded: { ...s.expanded, [path]: entries } })),
  setCursor: (line, column) => set({ cursor: { line, column } }),
  setLeftTab: (leftTab) => set({ leftTab }),
  toggleAgent: () => set((s) => ({ agentOpen: !s.agentOpen })),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  setTerminalHeight: (terminalHeight) => set({ terminalHeight }),
  setAgentWidth: (agentWidth) => set({ agentWidth }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setSearch: (searchQuery, searchHits) => set({ searchQuery, searchHits }),
  setFileIndex: (fileIndex) => set({ fileIndex }),
  openTab: (tab) =>
    set((s) => {
      const exists = s.tabs.some((t) => t.path === tab.path);
      return {
        tabs: exists ? s.tabs : [...s.tabs, tab],
        activePath: tab.path,
      };
    }),
  closeTab: (path) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      const activePath =
        s.activePath === path ? (tabs[tabs.length - 1]?.path ?? null) : s.activePath;
      return { tabs, activePath };
    }),
  setActive: (activePath) => set({ activePath }),
  updateContent: (path, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, content } : t)),
    })),
  markSaved: (path) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, original: t.content } : t)),
    })),
  reloadTab: (path, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === path ? { ...t, content, original: content } : t,
      ),
    })),
  addUserMessage: (content) => {
    const id = uid();
    set((s) => ({
      messages: [...s.messages, { id, role: "user", content, tools: [] }],
    }));
    return id;
  },
  ensureAssistant: () => {
    const last = get().messages[get().messages.length - 1];
    if (last?.role === "assistant" && get().streaming) return last.id;
    const id = uid();
    set((s) => ({
      messages: [...s.messages, { id, role: "assistant", content: "", thinking: "", tools: [] }],
    }));
    return id;
  },
  appendThinking: (text) =>
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") {
        messages[messages.length - 1] = { ...last, thinking: (last.thinking || "") + text };
      }
      return { messages };
    }),
  appendContent: (text) =>
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") {
        messages[messages.length - 1] = { ...last, content: last.content + text };
      }
      return { messages };
    }),
  startTool: (card) =>
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") {
        messages[messages.length - 1] = { ...last, tools: [...last.tools, card] };
      }
      return { messages };
    }),
  finishTool: (id, ok, output) =>
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") {
        messages[messages.length - 1] = {
          ...last,
          tools: last.tools.map((t) =>
            t.id === id ? { ...t, ok, output, status: ok ? "done" : "error" } : t,
          ),
        };
      }
      return { messages };
    }),
  setStreaming: (streaming) => set({ streaming }),
  setStatus: (status) => set({ status }),
  newChat: () => set({ messages: [], streaming: false }),
}));
