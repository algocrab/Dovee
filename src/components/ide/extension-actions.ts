import type { ExtensionInfo } from "@/types/extension";
import { useIde } from "@/stores/ide-store";
import { openFile } from "./file-tree";

async function postExtensions(body: Record<string, unknown>) {
  const res = await fetch("/api/extensions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    extensions?: ExtensionInfo[];
    status?: string;
    openPath?: string;
  };
  if (!data.ok) throw new Error(data.error ?? "Extensions request failed");
  if (data.extensions) useIde.getState().setExtensions(data.extensions);
  return data;
}

export async function loadExtensions() {
  const res = await fetch("/api/extensions");
  const data = (await res.json()) as { ok?: boolean; error?: string; extensions?: ExtensionInfo[] };
  if (!data.ok) throw new Error(data.error ?? "Could not load extensions");
  useIde.getState().setExtensions(data.extensions ?? []);
}

export async function reloadExtensions() {
  try {
    await postExtensions({ action: "reload" });
    useIde.getState().setStatus("Extensions reloaded");
  } catch (error) {
    useIde.getState().setStatus(error instanceof Error ? error.message : "Could not reload extensions");
  }
}

export async function runExtensionCommand(commandId: string) {
  const state = useIde.getState();
  const command = state.extensions
    .filter((ext) => ext.enabled)
    .flatMap((ext) => ext.commands)
    .find((item) => item.id === commandId);
  if (command?.insert) {
    state.requestInsert(command.insert);
    state.setStatus(command.message ?? command.title);
    return;
  }
  if (command?.themeId) {
    state.setExtensionTheme(command.themeId);
    state.setStatus(command.message ?? `Theme: ${command.themeId}`);
    return;
  }
  try {
    const data = await postExtensions({ action: "run", commandId });
    if (data.status) useIde.getState().setStatus(data.status);
    if (data.openPath) void openFile(data.openPath);
  } catch (error) {
    useIde.getState().setStatus(error instanceof Error ? error.message : "Extension command failed");
  }
}

export async function toggleExtension(id: string, enabled: boolean) {
  try {
    await postExtensions({ action: "toggle", id, enabled });
    const state = useIde.getState();
    if (!enabled && state.extensionThemeId) {
      const still = state.extensions.some(
        (ext) => ext.enabled && ext.themes.some((theme) => theme.id === state.extensionThemeId),
      );
      if (!still) state.setExtensionTheme(null);
    }
  } catch (error) {
    useIde.getState().setStatus(error instanceof Error ? error.message : "Could not update extension");
  }
}

export async function scaffoldSampleExtension() {
  try {
    await postExtensions({ action: "scaffold" });
    useIde.getState().setStatus("Created .dovee/extensions/hello-workspace");
  } catch (error) {
    useIde.getState().setStatus(error instanceof Error ? error.message : "Could not create sample extension");
  }
}
