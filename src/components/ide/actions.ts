import { languageFromPath } from "@/lib/ignore";
import { applyEditorFontSize, applyTheme, type ThemeId } from "@/lib/theme";
import { useIde, type PublicSettings } from "@/stores/ide-store";
import type { AgentFileDiff } from "@/types/chat";

export function openDiffTab(diff: AgentFileDiff, origin: "git" | "agent" = "agent") {
  const virtual = origin === "git" ? `diff://${diff.path}` : `agent-diff://${diff.path}`;
  useIde.getState().openTab({
    path: virtual,
    sourcePath: diff.path,
    kind: "diff",
    content: diff.modified,
    original: diff.original,
    language: languageFromPath(diff.path),
  });
}

export async function saveTab(path: string) {
  const tab = useIde.getState().tabs.find((t) => t.path === path);
  if (!tab) return;
  let formatted = false;
  if (useIde.getState().settings?.formatOnSave && tab.kind !== "diff") {
    const result = await formatTab(path);
    formatted = result.ok && Boolean(result.changed);
  }
  // Re-read: formatting may have swapped the buffer since we looked at it.
  const fresh = useIde.getState().tabs.find((t) => t.path === path);
  if (!fresh) return;
  const response = await fetch("/api/files/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: fresh.sourcePath ?? fresh.path, content: fresh.content }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(detail?.error ?? `Could not save ${path}`);
  }
  useIde.getState().markSaved(path);
  useIde.getState().setStatus(`Saved ${path}${formatted ? " (formatted)" : ""}`);
}

export type FormatOutcome = {
  ok: boolean;
  changed?: boolean;
  /** True when this file type has no formatter — worth staying quiet about. */
  unsupported?: boolean;
  error?: string;
};

/**
 * Format one open buffer with the workspace's prettier and update it in place.
 * Deliberately does not save — the caller decides when to write to disk.
 */
export async function formatTab(path: string): Promise<FormatOutcome> {
  const tab = useIde.getState().tabs.find((t) => t.path === path);
  if (!tab) return { ok: false, error: "File is not open" };
  if (tab.kind === "diff") return { ok: false, error: "Diff views are read-only" };
  try {
    const res = await fetch("/api/format", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tab.sourcePath ?? tab.path, content: tab.content }),
    });
    const data = (await res.json()) as FormatOutcome & { formatted?: string };
    if (!data.ok || typeof data.formatted !== "string") {
      return { ok: false, unsupported: data.unsupported, error: data.error ?? "Format failed" };
    }
    if (data.changed) useIde.getState().updateContent(path, data.formatted);
    return { ok: true, changed: Boolean(data.changed) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Format failed" };
  }
}

/** Format the active tab and report the outcome in the status bar. */
export async function formatActive() {
  const { activePath, setStatus } = useIde.getState();
  if (!activePath) return;
  const result = await formatTab(activePath);
  if (!result.ok) {
    setStatus(result.error ?? "Could not format this file");
    return;
  }
  setStatus(result.changed ? `Formatted ${activePath}` : `${activePath} is already formatted`);
}

export async function saveAll() {
  const dirty = useIde.getState().tabs.filter((t) => t.kind !== "diff" && t.content !== t.original);
  let saved = 0;
  for (const tab of dirty) {
    try {
      await saveTab(tab.path);
      saved += 1;
    } catch (error) {
      useIde.getState().setStatus(error instanceof Error ? error.message : `Could not save ${tab.path}`);
      break;
    }
  }
  if (saved) useIde.getState().setStatus(`Saved ${saved} file${saved === 1 ? "" : "s"}`);
}

export function closeTabSafe(path: string, groupId?: string) {
  const state = useIde.getState();
  const gid = groupId ?? state.focusedGroupId;
  const tab = state.tabs.find((t) => t.path === path);
  const otherHas = state.editorGroups.some((g) => g.id !== gid && g.paths.includes(path));
  if (tab && tab.kind !== "diff" && tab.content !== tab.original && !otherHas) {
    if (!confirm(`${path} has unsaved changes. Close anyway?`)) return;
  }
  state.closeTab(path, gid);
}

export function closeGroupSafe(groupId: string) {
  const state = useIde.getState();
  const group = state.editorGroups.find((g) => g.id === groupId);
  if (!group) return;
  const stillOpen = new Set(
    state.editorGroups.filter((g) => g.id !== groupId).flatMap((g) => g.paths),
  );
  const uniqueDirty = group.paths.filter((p) => {
    if (stillOpen.has(p)) return false;
    const tab = state.tabs.find((t) => t.path === p);
    return Boolean(tab && tab.kind !== "diff" && tab.content !== tab.original);
  });
  if (uniqueDirty.length && !confirm(`${uniqueDirty.length} unsaved file(s) in this group. Close anyway?`)) {
    return;
  }
  state.closeGroup(groupId);
}

export function closeAllTabs() {
  const dirty = useIde.getState().tabs.filter((t) => t.kind !== "diff" && t.content !== t.original);
  if (dirty.length && !confirm(`${dirty.length} unsaved file(s). Close all anyway?`)) return;
  useIde.getState().resetEditors();
}

export async function persistAppearance(
  patch: Partial<{
    theme: ThemeId;
    editorFontSize: number;
    wordWrap: boolean;
    minimap: boolean;
    autoSave: boolean;
    formatOnSave: boolean;
  }>,
) {
  if (patch.theme) {
    applyTheme(patch.theme);
    useIde.getState().setExtensionTheme(null);
  }
  if (typeof patch.editorFontSize === "number") applyEditorFontSize(patch.editorFontSize);
  useIde.getState().patchAppearance(patch);
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function persistChats() {
  const { chats, activeChatId } = useIde.getState();
  try {
    await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chats, activeChatId }),
    });
  } catch {
    /* a failed autosave must never break the editor */
  }
}

export async function refreshProblems() {
  try {
    const data = await fetch("/api/diagnostics").then((r) => r.json());
    useIde.getState().setProblems(data.items ?? []);
  } catch {
    /* ignore */
  }
}

export async function createNewFile() {
  const name = prompt("New file path", "untitled.ts");
  if (!name?.trim()) return;
  const path = name.trim().replace(/\\/g, "/");
  await fetch("/api/files/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content: "" }),
  });
  const { openFile, refreshRoot } = await import("./file-tree");
  await refreshRoot();
  await openFile(path);
}

export function openNewWindow() {
  const opened = window.open(window.location.href, "_blank", "noopener");
  if (!opened) useIde.getState().setStatus("Popup blocked — allow popups to open a new window");
}

export function pickOpenFile() {
  useIde.getState().setCommandOpen(true, "files");
}

export async function runProjectTests() {
  const state = useIde.getState();
  state.setBottomTab("terminal");
  state.setStatus("Running project tests…");
  try {
    const response = await fetch("/api/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: state.activeTermId, data: "npm test\r" }),
    });
    if (!response.ok) throw new Error("Could not start project tests");
  } catch (error) {
    state.setStatus(error instanceof Error ? error.message : "Could not start project tests");
  }
}

async function pickFolderPath() {
  const startPath = useIde.getState().settings?.hasFolder
    ? useIde.getState().settings?.workspace
    : undefined;
  useIde.getState().setStatus("Select a folder…");
  try {
    if (window.doveeDesktop?.pickFolder) {
      const picked = await window.doveeDesktop.pickFolder(startPath);
      if (!picked) {
        useIde.getState().setStatus("Ready");
        return null;
      }
      return picked;
    }
    const res = await fetch("/api/files/pick-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startPath }),
    });
    const data = (await res.json()) as { path?: string; cancelled?: boolean; error?: string };
    if (!res.ok || data.error) {
      useIde.getState().setStatus(data.error ?? "Could not open the folder picker");
      return null;
    }
    if (data.cancelled || !data.path) {
      useIde.getState().setStatus("Ready");
      return null;
    }
    return data.path;
  } catch (error) {
    useIde.getState().setStatus(error instanceof Error ? error.message : "Could not open the folder picker");
    return null;
  }
}

export async function openFolder(folderPath?: string) {
  const next = folderPath?.trim() || (await pickFolderPath());
  if (!next?.trim()) return;
  const current = useIde.getState().settings?.workspace ?? "";
  if (next.trim() === current && useIde.getState().settings?.hasFolder) return;

  const dirty = useIde.getState().tabs.filter((t) => t.kind !== "diff" && t.content !== t.original);
  if (dirty.length && !confirm(`${dirty.length} unsaved file(s). Switch folder anyway?`)) return;

  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace: next.trim() }),
  });
  const data = (await res.json()) as PublicSettings & { error?: string };
  if (!res.ok || data.error) {
    useIde.getState().setStatus(data.error ?? "Could not open folder");
    return;
  }

  useIde.getState().resetEditors();
  useIde.setState({ expanded: {}, tree: [], searchHits: [], fileIndex: [] });
  useIde.getState().setSettings(data as PublicSettings);
  useIde.getState().setLeftTab("explorer");

  // Server already rebinds chokidar on workspace change; bounce the SSE so the
  // client picks up the new root immediately instead of waiting for a drop.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("dovee:workspace-changed"));
  }

  const { refreshRoot } = await import("./file-tree");
  await refreshRoot();
  const list = await fetch("/api/files/list").then((r) => r.json());
  useIde.getState().setFileIndex(list.files ?? []);
  const git = await fetch("/api/git").then((r) => r.json());
  useIde.getState().setGitBranch(git.isRepo ? git.branch : "");
  useIde.getState().setStatus(`Opened ${data.workspace ?? next.trim()}`);
}
