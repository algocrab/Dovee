import { create } from "zustand";
import type { ThemeId } from "@/lib/theme";
import type { AgentChat, AgentFileDiff, ChatAttachment, ChatMsg, ChatUsage, ToolCard } from "@/types/chat";
import type { Breakpoint, DebugFrame, DebugPaused, DebugSnapshot, DebugStatus, DebugVar } from "@/types/debug";
import type { ExtensionInfo } from "@/types/extension";

export type TreeEntry = { name: string; path: string; type: "file" | "dir" };

export type Tab = {
  path: string;
  content: string;
  original: string;
  language: string;
  /** "diff" tabs are read-only side-by-side views opened from git or the agent. */
  kind?: "file" | "diff";
  /** Real workspace path when `path` is a virtual diff URI like `diff:src/foo.ts`. */
  sourcePath?: string;
};

export type { AgentChat, AgentFileDiff, ChatAttachment, ChatMsg, ChatUsage, ToolCard };
export type { Breakpoint, DebugFrame, DebugPaused, DebugStatus, DebugVar };

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
  formatOnSave: boolean;
  completionEnabled: boolean;
  completionModel: string;
  completionPrivacy: "local-context" | "workspace";
  completionExcludedPaths: string[];
  collaborationEnabled: boolean;
  maxToolRounds: number;
};

export type LeftTab = "explorer" | "search" | "context" | "git" | "debug" | "extensions";

export type Problem = {
  path: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  code: string;
  message: string;
};

/** A one-shot "jump the editor here" request (search hit, problem, go-to). */
export type RevealTarget = {
  path: string;
  line: number;
  column: number;
  /** Bumped on every request so repeat jumps to the same line still fire. */
  nonce: number;
};

/** One editor column (tab strip + pane). Two groups = side-by-side split. */
export type EditorGroup = {
  id: string;
  paths: string[];
  activePath: string | null;
};

export const PRIMARY_GROUP_ID = "group-1";
export const MAX_EDITOR_GROUPS = 2;

function emptyGroup(id = PRIMARY_GROUP_ID): EditorGroup {
  return { id, paths: [], activePath: null };
}

function activateInGroup(group: EditorGroup, path: string): EditorGroup {
  if (group.paths.includes(path)) return { ...group, activePath: path };
  return { ...group, paths: [...group.paths, path], activePath: path };
}

function dropFromGroup(group: EditorGroup, path: string): EditorGroup {
  const paths = group.paths.filter((p) => p !== path);
  if (paths.length === group.paths.length) return group;
  const activePath = group.activePath === path ? (paths[paths.length - 1] ?? null) : group.activePath;
  return { ...group, paths, activePath };
}

function focusedActive(groups: EditorGroup[], focusedGroupId: string): string | null {
  return groups.find((g) => g.id === focusedGroupId)?.activePath ?? groups[0]?.activePath ?? null;
}

function ensureGroups(groups: EditorGroup[] | undefined, focusedGroupId: string | undefined) {
  const editorGroups = groups?.length ? groups : [emptyGroup()];
  const nextFocus = editorGroups.some((g) => g.id === focusedGroupId)
    ? (focusedGroupId as string)
    : editorGroups[0].id;
  return { editorGroups, focusedGroupId: nextFocus };
}

function pruneGroups(
  groups: EditorGroup[],
  focusedGroupId: string,
): { editorGroups: EditorGroup[]; focusedGroupId: string } {
  if (groups.length <= 1) {
    const editorGroups = groups.length ? groups : [emptyGroup()];
    return { editorGroups, focusedGroupId: editorGroups[0].id };
  }
  const editorGroups = groups.filter((g) => g.paths.length > 0);
  if (editorGroups.length === 0) {
    const group = emptyGroup();
    return { editorGroups: [group], focusedGroupId: group.id };
  }
  const nextFocus = editorGroups.some((g) => g.id === focusedGroupId)
    ? focusedGroupId
    : editorGroups[editorGroups.length - 1].id;
  return { editorGroups, focusedGroupId: nextFocus };
}

export type SearchHit = {
  path: string;
  line: number;
  text: string;
  column?: number;
  match?: string;
};

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeChat(n: number): AgentChat {
  // Keep the server-rendered first chat deterministic; subsequent chats are client-only.
  return { id: n === 1 ? "chat-1" : uid(), title: n <= 1 ? "New chat" : `Chat ${n}`, messages: [], streaming: false };
}

function patchChat(chats: AgentChat[], id: string, fn: (c: AgentChat) => AgentChat) {
  return chats.map((c) => (c.id === id ? fn(c) : c));
}

type IdeState = {
  settings: PublicSettings | null;
  tree: TreeEntry[];
  expanded: Record<string, TreeEntry[]>;
  tabs: Tab[];
  editorGroups: EditorGroup[];
  focusedGroupId: string;
  splitRatio: number;
  activePath: string | null;
  cursor: { line: number; column: number };
  reveal: RevealTarget | null;
  leftTab: LeftTab;
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
  breakpoints: Breakpoint[];
  debugStatus: DebugStatus;
  debugFrames: DebugFrame[];
  debugVars: DebugVar[];
  debugOutput: string;
  debugPaused: DebugPaused | null;
  debugArgs: string;
  extensions: ExtensionInfo[];
  extensionThemeId: string | null;
  pendingInsert: { text: string; nonce: number } | null;
  setSettings: (s: PublicSettings) => void;
  setTree: (e: TreeEntry[]) => void;
  setExpanded: (path: string, entries: TreeEntry[]) => void;
  setCursor: (line: number, column: number) => void;
  revealIn: (path: string, line: number, column?: number) => void;
  setSearch: (q: string, hits: SearchHit[]) => void;
  setLeftTab: (t: LeftTab) => void;
  toggleAgent: () => void;
  toggleTerminal: () => void;
  setTerminalHeight: (n: number) => void;
  setAgentWidth: (n: number) => void;
  setSettingsOpen: (v: boolean) => void;
  setCommandOpen: (v: boolean, mode?: "files" | "commands") => void;
  setSidebarWidth: (n: number) => void;
  setBottomTab: (t: "terminal" | "problems") => void;
  setProblems: (p: Problem[]) => void;
  patchAppearance: (
    p: Partial<Pick<PublicSettings, "theme" | "editorFontSize" | "wordWrap" | "minimap" | "autoSave" | "formatOnSave">>,
  ) => void;
  setFileIndex: (files: string[]) => void;
  setGitBranch: (branch: string) => void;
  openTab: (tab: Tab) => void;
  closeTab: (path: string, groupId?: string) => void;
  evictTab: (path: string) => void;
  resetEditors: () => void;
  setActive: (path: string, groupId?: string) => void;
  focusGroup: (id: string) => void;
  splitEditor: () => void;
  closeGroup: (id: string) => void;
  joinEditors: () => void;
  setSplitRatio: (n: number) => void;
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
  finishTool: (chatId: string, id: string, ok: boolean, output: string, diff?: AgentFileDiff) => void;
  setMessageUsage: (chatId: string, usage: ChatUsage) => void;
  setChatStreaming: (chatId: string, v: boolean) => void;
  setStatus: (s: string) => void;
  addTerminal: () => string;
  setActiveTerm: (id: string) => void;
  closeTerminal: (id: string) => void;
  toggleBreakpoint: (path: string, line: number) => void;
  clearBreakpoints: (path?: string) => void;
  remapBreakpoints: (from: string, to: string) => void;
  setDebugArgs: (args: string) => void;
  setDebugStatus: (status: DebugStatus) => void;
  setDebugVars: (vars: DebugVar[]) => void;
  appendDebugOutput: (text: string) => void;
  clearDebugPaused: () => void;
  applyDebugSnapshot: (snap: DebugSnapshot) => void;
  resetDebugSession: () => void;
  setExtensions: (extensions: ExtensionInfo[]) => void;
  setExtensionTheme: (id: string | null) => void;
  requestInsert: (text: string) => void;
};

const firstChat = makeChat(1);
const firstTerm: TermTab = { id: "term-1", name: "powershell" };

export const useIde = create<IdeState>((set, get) => ({
  settings: null,
  tree: [],
  expanded: {},
  tabs: [],
  editorGroups: [emptyGroup()],
  focusedGroupId: PRIMARY_GROUP_ID,
  splitRatio: 0.5,
  activePath: null,
  cursor: { line: 1, column: 1 },
  reveal: null,
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
  breakpoints: [],
  debugStatus: "idle",
  debugFrames: [],
  debugVars: [],
  debugOutput: "",
  debugPaused: null,
  debugArgs: "",
  extensions: [],
  extensionThemeId: null,
  pendingInsert: null,
  setSettings: (settings) => set({ settings }),
  setTree: (tree) => set({ tree }),
  setExpanded: (path, entries) =>
    set((s) => ({ expanded: { ...s.expanded, [path]: entries } })),
  setCursor: (line, column) => set({ cursor: { line, column } }),
  revealIn: (path, line, column = 1) =>
    set((s) => {
      const owning =
        s.editorGroups.find((g) => g.id === s.focusedGroupId && g.paths.includes(path)) ??
        s.editorGroups.find((g) => g.paths.includes(path));
      const focusedGroupId = owning?.id ?? s.focusedGroupId;
      const editorGroups = s.editorGroups.map((g) =>
        g.id === focusedGroupId && g.paths.includes(path) ? { ...g, activePath: path } : g,
      );
      return {
        reveal: { path, line, column, nonce: (s.reveal?.nonce ?? 0) + 1 },
        editorGroups,
        focusedGroupId,
        activePath: focusedActive(editorGroups, focusedGroupId),
      };
    }),
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
      const { editorGroups: groups, focusedGroupId } = ensureGroups(s.editorGroups, s.focusedGroupId);
      const editorGroups = groups.map((g) =>
        g.id === focusedGroupId ? activateInGroup(g, tab.path) : g,
      );
      return {
        tabs: exists ? s.tabs : [...s.tabs, tab],
        editorGroups,
        focusedGroupId,
        activePath: tab.path,
      };
    }),
  closeTab: (path, groupId) =>
    set((s) => {
      const gid = groupId ?? s.focusedGroupId;
      const nextGroups = s.editorGroups.map((g) => (g.id === gid ? dropFromGroup(g, path) : g));
      const pruned = pruneGroups(nextGroups, s.focusedGroupId === gid ? gid : s.focusedGroupId);
      const stillOpen = pruned.editorGroups.some((g) => g.paths.includes(path));
      return {
        tabs: stillOpen ? s.tabs : s.tabs.filter((t) => t.path !== path),
        editorGroups: pruned.editorGroups,
        focusedGroupId: pruned.focusedGroupId,
        activePath: focusedActive(pruned.editorGroups, pruned.focusedGroupId),
      };
    }),
  evictTab: (path) =>
    set((s) => {
      const pruned = pruneGroups(
        s.editorGroups.map((g) => dropFromGroup(g, path)),
        s.focusedGroupId,
      );
      return {
        tabs: s.tabs.filter((t) => t.path !== path),
        editorGroups: pruned.editorGroups,
        focusedGroupId: pruned.focusedGroupId,
        activePath: focusedActive(pruned.editorGroups, pruned.focusedGroupId),
      };
    }),
  resetEditors: () =>
    set({
      tabs: [],
      editorGroups: [emptyGroup()],
      focusedGroupId: PRIMARY_GROUP_ID,
      activePath: null,
      breakpoints: [],
    }),
  setActive: (path, groupId) =>
    set((s) => {
      const gid = groupId ?? s.focusedGroupId;
      const editorGroups = s.editorGroups.map((g) =>
        g.id === gid ? { ...g, activePath: path } : g,
      );
      return { editorGroups, focusedGroupId: gid, activePath: path };
    }),
  focusGroup: (id) =>
    set((s) => {
      const group = s.editorGroups.find((g) => g.id === id);
      if (!group) return s;
      return { focusedGroupId: id, activePath: group.activePath };
    }),
  splitEditor: () =>
    set((s) => {
      const path = s.activePath;
      if (!path) return { status: "Open a file to split the editor" };
      if (s.editorGroups.length >= MAX_EDITOR_GROUPS) {
        const other = s.editorGroups.find((g) => g.id !== s.focusedGroupId);
        if (!other) return s;
        const editorGroups = s.editorGroups.map((g) =>
          g.id === other.id ? activateInGroup(g, path) : g,
        );
        return { editorGroups, focusedGroupId: other.id, activePath: path };
      }
      const newGroup: EditorGroup = { id: uid(), paths: [path], activePath: path };
      return { editorGroups: [...s.editorGroups, newGroup] };
    }),
  closeGroup: (id) =>
    set((s) => {
      if (s.editorGroups.length <= 1) return s;
      const remaining = s.editorGroups.filter((g) => g.id !== id);
      if (!remaining.length) return s;
      const stillOpen = new Set(remaining.flatMap((g) => g.paths));
      const focusedGroupId = s.focusedGroupId === id ? remaining[0].id : s.focusedGroupId;
      return {
        tabs: s.tabs.filter((t) => stillOpen.has(t.path)),
        editorGroups: remaining,
        focusedGroupId,
        activePath: focusedActive(remaining, focusedGroupId),
      };
    }),
  joinEditors: () =>
    set((s) => {
      if (s.editorGroups.length < 2) return s;
      const focused = s.editorGroups.find((g) => g.id === s.focusedGroupId) ?? s.editorGroups[0];
      const paths = [...focused.paths];
      for (const group of s.editorGroups) {
        if (group.id === focused.id) continue;
        for (const path of group.paths) {
          if (!paths.includes(path)) paths.push(path);
        }
      }
      const group: EditorGroup = { ...focused, paths, activePath: focused.activePath };
      return {
        editorGroups: [group],
        focusedGroupId: group.id,
        activePath: group.activePath,
      };
    }),
  setSplitRatio: (n) => set({ splitRatio: Math.max(0.22, Math.min(0.78, n)) }),
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
  finishTool: (chatId, id, ok, output, diff) =>
    set((s) => ({
      chats: patchChat(s.chats, chatId, (c) => {
        const messages = [...c.messages];
        const last = messages[messages.length - 1];
        if (last?.role === "assistant") {
          messages[messages.length - 1] = {
            ...last,
            tools: last.tools.map((t) =>
              t.id === id ? { ...t, ok, output, status: ok ? "done" : "error", diff } : t,
            ),
          };
        }
        return { ...c, messages };
      }),
    })),
  setMessageUsage: (chatId, usage) =>
    set((s) => ({
      chats: patchChat(s.chats, chatId, (c) => {
        const messages = [...c.messages];
        const last = messages[messages.length - 1];
        if (last?.role === "assistant") {
          messages[messages.length - 1] = { ...last, usage };
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
  toggleBreakpoint: (path, line) =>
    set((s) => {
      const existing = s.breakpoints.find((bp) => bp.path === path && bp.line === line);
      if (existing) {
        return { breakpoints: s.breakpoints.filter((bp) => bp.id !== existing.id) };
      }
      const breakpoint: Breakpoint = { id: `${path}:${line}`, path, line, enabled: true };
      return { breakpoints: [...s.breakpoints, breakpoint] };
    }),
  clearBreakpoints: (path) =>
    set((s) => ({
      breakpoints: path ? s.breakpoints.filter((bp) => bp.path !== path) : [],
    })),
  remapBreakpoints: (from, to) =>
    set((s) => ({
      breakpoints: s.breakpoints.map((bp) =>
        bp.path === from ? { ...bp, id: `${to}:${bp.line}`, path: to } : bp,
      ),
    })),
  setDebugArgs: (debugArgs) => set({ debugArgs }),
  setDebugStatus: (debugStatus) => set({ debugStatus }),
  setDebugVars: (debugVars) => set({ debugVars }),
  appendDebugOutput: (text) =>
    set((s) => ({ debugOutput: (s.debugOutput + text).slice(-32_000) })),
  clearDebugPaused: () => set({ debugPaused: null, debugFrames: [], debugVars: [] }),
  applyDebugSnapshot: (snap) =>
    set({
      debugStatus: snap.status,
      debugFrames: snap.frames,
      debugVars: snap.vars,
      debugOutput: snap.output,
      debugPaused: snap.paused,
    }),
  resetDebugSession: () =>
    set({
      debugStatus: "idle",
      debugFrames: [],
      debugVars: [],
      debugPaused: null,
    }),
  setExtensions: (extensions) => set({ extensions }),
  setExtensionTheme: (extensionThemeId) => set({ extensionThemeId }),
  requestInsert: (text) =>
    set((s) => ({ pendingInsert: { text, nonce: (s.pendingInsert?.nonce ?? 0) + 1 } })),
}));
