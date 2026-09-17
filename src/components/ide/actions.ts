import { applyEditorFontSize, applyTheme, type ThemeId } from "@/lib/theme";
import { useIde, type PublicSettings } from "@/stores/ide-store";

export async function saveTab(path: string) {
  const tab = useIde.getState().tabs.find((t) => t.path === path);
  if (!tab) return;
  await fetch("/api/files/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: tab.path, content: tab.content }),
  });
  useIde.getState().markSaved(path);
  useIde.getState().setStatus(`Saved ${path}`);
}

export async function saveAll() {
  const dirty = useIde.getState().tabs.filter((t) => t.content !== t.original);
  for (const tab of dirty) await saveTab(tab.path);
  if (dirty.length) useIde.getState().setStatus(`Saved ${dirty.length} file${dirty.length === 1 ? "" : "s"}`);
}

export function closeTabSafe(path: string) {
  const tab = useIde.getState().tabs.find((t) => t.path === path);
  if (tab && tab.content !== tab.original) {
    if (!confirm(`${path} has unsaved changes. Close anyway?`)) return;
  }
  useIde.getState().closeTab(path);
}

export function closeAllTabs() {
  const dirty = useIde.getState().tabs.filter((t) => t.content !== t.original);
  if (dirty.length && !confirm(`${dirty.length} unsaved file(s). Close all anyway?`)) return;
  for (const tab of [...useIde.getState().tabs]) useIde.getState().closeTab(tab.path);
}

export async function persistAppearance(
  patch: Partial<{ theme: ThemeId; editorFontSize: number; wordWrap: boolean; minimap: boolean; autoSave: boolean }>,
) {
  if (patch.theme) applyTheme(patch.theme);
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

async function pickFolderPath() {
  const startPath = useIde.getState().settings?.workspace;
  if (window.doveeDesktop?.pickFolder) {
    return window.doveeDesktop.pickFolder(startPath);
  }
  useIde.getState().setStatus("Select a folder…");
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
}

export async function openFolder() {
  const next = await pickFolderPath();
  if (!next?.trim()) return;
  const current = useIde.getState().settings?.workspace ?? "";
  if (next.trim() === current) return;

  const dirty = useIde.getState().tabs.filter((t) => t.content !== t.original);
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

  for (const tab of [...useIde.getState().tabs]) useIde.getState().closeTab(tab.path);
  useIde.setState({ expanded: {}, tree: [], searchHits: [], fileIndex: [] });
  useIde.getState().setSettings(data as PublicSettings);
  useIde.getState().setLeftTab("explorer");

  const { refreshRoot } = await import("./file-tree");
  await refreshRoot();
  const list = await fetch("/api/files/list").then((r) => r.json());
  useIde.getState().setFileIndex(list.files ?? []);
  const git = await fetch("/api/git").then((r) => r.json());
  useIde.getState().setGitBranch(git.isRepo ? git.branch : "");
  useIde.getState().setStatus(`Opened ${data.workspace ?? next.trim()}`);
}
