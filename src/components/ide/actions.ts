import { applyEditorFontSize, applyTheme, type ThemeId } from "@/lib/theme";
import { useIde } from "@/stores/ide-store";

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
