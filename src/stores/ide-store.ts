import { create } from "zustand";
import type { ThemeId } from "@/lib/theme";
import type { AgentChat, ChatAttachment, ChatMsg, ToolCard } from "@/types/chat";

export type TreeEntry = { name: string; path: string; type: "file" | "dir" };

export type Tab = {
  path: string;
  content: string;
  original: string;
  language: string;
};

export type { AgentChat, ChatAttachment, ChatMsg, ToolCard };

export type TermTab = {
  id: string;
  name: string;
};

export type PublicSettings = {
  provider: string;
  model: string;
  reasoningEffort: "none" | "low" | "high" | "max";
  workspace: string;
  hasFolder: boolean;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyHint: string;
  theme: ThemeId;
  editorFontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  autoSave: boolean;
};

export type Problem = {
  path: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  code: string;
  message: string;
};

type SearchHit = { path: string; line: number; text: string };

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeChat(n: number): AgentChat {
  return { id: uid(), title: n <= 1 ? "New chat" : `Chat ${n}`, messages: [], streaming: false };
}

function patchChat(chats: AgentChat[], id: string, fn: (c: AgentChat) => AgentChat) {
  return chats.map((c) => (c.id === id ? fn(c) : c));
}

type IdeState = {
  settings: PublicSettings | null;
  tree: TreeEntry[];
  expanded: Record<string, TreeEntry[]>;
  tabs: Tab[];
  activePath: string | null;
  cursor: { line: number; column: number };
  leftTab: "explorer" | "search" | "git";
  agentOpen: boolean;
  terminalOpen: boolean;
  terminalHeight: number;
  agentWidth: number;
  settingsOpen: boolean;
  commandOpen: boolean;
  commandMode: "files" | "commands";
  sidebarWidth: number;
  bottomTab: "terminal" | "problems";
  problems: Problem[];
  searchQuery: string;
  searchHits: SearchHit[];
  fileIndex: string[];
  chats: AgentChat[];
  activeChatId: string;
  termTabs: TermTab[];
  activeTermId: string;
  drafts: Record<string, string>;
  composerFocusToken: number;
  gitBranch: string;
  status: string;
  setSettings: (s: PublicSettings) => void;
  setTree: (e: TreeEntry[]) => void;
  setExpanded: (path: string, entries: TreeEntry[]) => void;
  setCursor: (line: number, column: number) => void;
  setLeftTab: (t: "explorer" | "search" | "git") => void;
  toggleAgent: () => void;
  toggleTerminal: () => void;
  setTerminalHeight: (n: number) => void;
  setAgentWidth: (n: number) => void;
  setSettingsOpen: (v: boolean) => void;
  setCommandOpen: (v: boolean, mode?: "files" | "commands") => void;
  setSidebarWidth: (n: number) => void;
  setBottomTab: (t: "terminal" | "problems") => void;
  setProblems: (p: Problem[]) => void;
  patchAppearance: (p: Partial<Pick<PublicSettings, "theme" | "editorFontSize" | "wordWrap" | "minimap" | "autoSave">>) => void;
  setSearch: (q: string, hits: SearchHit[]) => void;
  setFileIndex: (files: string[]) => void;
  setGitBranch: (branch: string) => void;
  openTab: (tab: Tab) => void;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string) => void;
  reloadTab: (path: string, content: string) => void;
  setActiveChat: (id: string) => void;
  hydrateChats: (chats: AgentChat[], activeChatId: string) => void;
  newChat: () => string;
  closeChat: (id: string) => void;
  addToChat: (text: string) => void;
  setDraft: (chatId: string, text: string) => void;
  addUserMessage: (chatId: string, content: string, attachments?: ChatAttachment[]) => string;
  ensureAssistant: (chatId: string) => string;
  appendThinking: (chatId: string, text: string) => void;
  appendContent: (chatId: string, text: string) => void;
  startTool: (chatId: string, card: ToolCard) => void;
  finishTool: (chatId: string, id: string, ok: boolean, output: string) => void;
  setChatStreaming: (chatId: string, v: boolean) => void;
  setStatus: (s: string) => void;
  addTerminal: () => string;
  setActiveTerm: (id: string) => void;
  closeTerminal: (id: string) => void;
};

const firstChat = makeChat(1);
const firstTerm: TermTab = { id: "term-1", name: "powershell" };

export const useIde = create<IdeState>((set, get) => ({
  settings: null,
  tree: [],
  expanded: {},
  tabs: [],
  activePath: null,
  cursor: { line: 1, column: 1 },
  leftTab: "explorer",
  agentOpen: true,
  terminalOpen: false,
  terminalHeight: 220,
  agentWidth: 380,
  settingsOpen: false,
  commandOpen: false,
  commandMode: "files",
  sidebarWidth: 280,
  bottomTab: "terminal",
  problems: [],
  searchQuery: "",
  searchHits: [],
  fileIndex: [],
  chats: [firstChat],
  activeChatId: firstChat.id,
  drafts: {},
  composerFocusToken: 0,
  termTabs: [firstTerm],
  activeTermId: firstTerm.id,
  gitBranch: "",
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
  setCommandOpen: (commandOpen, commandMode = "files") => set({ commandOpen, commandMode }),
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
  setBottomTab: (bottomTab) => set({ bottomTab, terminalOpen: true }),
  setProblems: (problems) => set({ problems }),
  patchAppearance: (p) =>
    set((s) => ({
      settings: s.settings ? { ...s.settings, ...p } : s.settings,
    })),
  setSearch: (searchQuery, searchHits) => set({ searchQuery, searchHits }),
  setFileIndex: (fileIndex) => set({ fileIndex }),
  setGitBranch: (gitBranch) => set({ gitBranch }),
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
  setActiveChat: (activeChatId) => set({ activeChatId, agentOpen: true }),
  // Restores chats saved to disk. Keeps the placeholder chat when there is nothing stored.
  hydrateChats: (chats, activeChatId) =>
    set(() => {
      if (!chats.length) return {};
      const active = chats.some((c) => c.id === activeChatId)
        ? activeChatId
        : chats[chats.length - 1]?.id ?? activeChatId;
      return { chats, activeChatId: active };
    }),
  newChat: () => {
    const chat = makeChat(get().chats.length + 1);
    set((s) => ({
      chats: [...s.chats, chat],
      activeChatId: chat.id,
      agentOpen: true,
    }));
    return chat.id;
  },
  closeChat: (id) =>
    set((s) => {
      if (s.chats.length <= 1) {
        const chat = makeChat(1);
        return { chats: [chat], activeChatId: chat.id };
      }
      const chats = s.chats.filter((c) => c.id !== id);
      const activeChatId = s.activeChatId === id ? chats[chats.length - 1]?.id ?? s.activeChatId : s.activeChatId;
      return { chats, activeChatId };
    }),
  addToChat: (text) =>
    set((s) => {
      const existing = (s.drafts[s.activeChatId] ?? "").replace(/\s+$/, "");
      return {
        drafts: { ...s.drafts, [s.activeChatId]: existing ? `${existing}\n\n${text}` : text },
        composerFocusToken: s.composerFocusToken + 1,
        agentOpen: true,
      };
    }),
  setDraft: (chatId, text) => set((s) => ({ drafts: { ...s.drafts, [chatId]: text } })),
  addUserMessage: (chatId, content, attachments) => {
    const id = uid();
    const titleSource = content.trim() || attachments?.[0]?.name || "New chat";
    set((s) => ({
      chats: patchChat(s.chats, chatId, (c) => ({
        ...c,
        title: c.messages.length === 0 ? titleSource.slice(0, 32) : c.title,
        messages: [...c.messages, { id, role: "user", content, tools: [], attachments }],
      })),
    }));
    return id;
  },
  ensureAssistant: (chatId) => {
    const chat = get().chats.find((c) => c.id === chatId);
    const last = chat?.messages[chat.messages.length - 1];
    if (last?.role === "assistant" && chat?.streaming) return last.id;
    const id = uid();
    set((s) => ({
      chats: patchChat(s.chats, chatId, (c) => ({
        ...c,
        messages: [...c.messages, { id, role: "assistant", content: "", thinking: "", tools: [] }],
      })),
    }));
    return id;
  },
  appendThinking: (chatId, text) =>
    set((s) => ({
      chats: patchChat(s.chats, chatId, (c) => {
        const messages = [...c.messages];
        const last = messages[messages.length - 1];
        if (last?.role === "assistant") {
          messages[messages.length - 1] = { ...last, thinking: (last.thinking || "") + text };
        }
        return { ...c, messages };
      }),
    })),
  appendContent: (chatId, text) =>
    set((s) => ({
      chats: patchChat(s.chats, chatId, (c) => {
        const messages = [...c.messages];
        const last = messages[messages.length - 1];
        if (last?.role === "assistant") {
          messages[messages.length - 1] = { ...last, content: last.content + text };
        }
        return { ...c, messages };
      }),
    })),
  startTool: (chatId, card) =>
    set((s) => ({
      chats: patchChat(s.chats, chatId, (c) => {
        const messages = [...c.messages];
        const last = messages[messages.length - 1];
        if (last?.role === "assistant") {
          messages[messages.length - 1] = { ...last, tools: [...last.tools, card] };
        }
        return { ...c, messages };
      }),
    })),
  finishTool: (chatId, id, ok, output) =>
    set((s) => ({
      chats: patchChat(s.chats, chatId, (c) => {
        const messages = [...c.messages];
        const last = messages[messages.length - 1];
        if (last?.role === "assistant") {
          messages[messages.length - 1] = {
            ...last,
            tools: last.tools.map((t) =>
              t.id === id ? { ...t, ok, output, status: ok ? "done" : "error" } : t,
            ),
          };
        }
        return { ...c, messages };
      }),
    })),
  setChatStreaming: (chatId, streaming) =>
    set((s) => ({
      chats: patchChat(s.chats, chatId, (c) => ({ ...c, streaming })),
    })),
  setStatus: (status) => set({ status }),
  addTerminal: () => {
    const id = `term-${uid()}`;
    const n = get().termTabs.length + 1;
    set((s) => ({
      termTabs: [...s.termTabs, { id, name: `powershell ${n}` }],
      activeTermId: id,
      terminalOpen: true,
      bottomTab: "terminal",
    }));
    return id;
  },
  setActiveTerm: (activeTermId) => set({ activeTermId, terminalOpen: true }),
  closeTerminal: (id) =>
    set((s) => {
      if (s.termTabs.length <= 1) return s;
      const termTabs = s.termTabs.filter((t) => t.id !== id);
      const activeTermId = s.activeTermId === id ? termTabs[termTabs.length - 1].id : s.activeTermId;
      return { termTabs, activeTermId };
    }),
}));
