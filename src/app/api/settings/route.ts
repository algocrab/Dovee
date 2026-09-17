import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { PROVIDERS } from "@/lib/providers";
import { clampMaxToolRounds } from "@/lib/tool-rounds";
import { loadSettings, publicSettings, saveSettings, type DoveeSettings } from "@/lib/settings";
import { restartAllShells } from "@/lib/shell";

export async function GET() {
  const settings = await loadSettings();
  return NextResponse.json(publicSettings(settings));
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<DoveeSettings>;
  const patch: Partial<DoveeSettings> = {};
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
  if (typeof body.maxToolRounds === "number") patch.maxToolRounds = clampMaxToolRounds(body.maxToolRounds);
  const next = await saveSettings(patch);
  if (patch.workspace) await restartAllShells();
  return NextResponse.json(publicSettings(next));
}
