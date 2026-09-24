import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { PROVIDERS } from "@/lib/providers";
import { clampMaxToolRounds } from "@/lib/tool-rounds";
import { loadSettings, publicSettings, saveSettings, type DoveeSettings } from "@/lib/settings";

export async function GET() {
  const settings = await loadSettings();
  return NextResponse.json(publicSettings(settings));
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<DoveeSettings> & { secureKeyStored?: boolean };
  const patch: Partial<DoveeSettings> = {};
  if (body.secureKeyStored === true) {
    process.env.DOVEE_SECURE_SETTINGS = "1";
  }
  if (typeof body.apiKey === "string") patch.apiKey = body.apiKey.trim();
  if (typeof body.model === "string" && body.model.trim()) patch.model = body.model.trim();
  if (typeof body.provider === "string" && PROVIDERS.some((p) => p.id === body.provider)) {
    patch.provider = body.provider as DoveeSettings["provider"];
  }
  if (body.reasoningEffort === "none" || body.reasoningEffort === "low" || body.reasoningEffort === "high" || body.reasoningEffort === "max") {
    patch.reasoningEffort = body.reasoningEffort;
  }
  if (typeof body.workspace === "string" && body.workspace.trim()) {
    const abs = path.resolve(body.workspace.trim());
    try {
      const stat = await fs.stat(abs);
      if (!stat.isDirectory()) {
        return NextResponse.json({ error: "Not a folder" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Folder not found" }, { status: 400 });
    }
    patch.workspace = abs;
  }
  if (typeof body.baseUrl === "string" && body.baseUrl.trim()) {
    patch.baseUrl = body.baseUrl.trim();
  }
  if (body.theme === "dark" || body.theme === "light" || body.theme === "dusk") patch.theme = body.theme;
  if (typeof body.editorFontSize === "number" && body.editorFontSize >= 11 && body.editorFontSize <= 22) {
    patch.editorFontSize = body.editorFontSize;
  }
  if (typeof body.wordWrap === "boolean") patch.wordWrap = body.wordWrap;
  if (typeof body.minimap === "boolean") patch.minimap = body.minimap;
  if (typeof body.autoSave === "boolean") patch.autoSave = body.autoSave;
  if (typeof body.formatOnSave === "boolean") patch.formatOnSave = body.formatOnSave;
  if (typeof body.completionEnabled === "boolean") patch.completionEnabled = body.completionEnabled;
  if (typeof body.completionModel === "string") patch.completionModel = body.completionModel.trim();
  if (body.completionPrivacy === "local-context" || body.completionPrivacy === "workspace") {
    patch.completionPrivacy = body.completionPrivacy;
  }
  if (Array.isArray(body.completionExcludedPaths)) {
    patch.completionExcludedPaths = body.completionExcludedPaths
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 100);
  }
  if (typeof body.collaborationEnabled === "boolean") patch.collaborationEnabled = body.collaborationEnabled;
  if (typeof body.maxToolRounds === "number") patch.maxToolRounds = clampMaxToolRounds(body.maxToolRounds);
  const next = await saveSettings(patch);
  if (patch.workspace) {
    try {
      const { restartAllShells } = await import("@/lib/shell");
      await restartAllShells();
    } catch {
      /* node-pty is optional — folder open must still succeed without a terminal */
    }
    try {
      const { resetWatcher } = await import("@/lib/watcher");
      await resetWatcher();
    } catch {
      /* watcher is best-effort */
    }
  }
  return NextResponse.json(publicSettings(next));
}
