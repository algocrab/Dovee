import { NextResponse } from "next/server";
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
  if (body.model === "deepseek-flash" || body.model === "deepseek-v4-pro") patch.model = body.model;
  if (body.reasoningEffort === "none" || body.reasoningEffort === "low" || body.reasoningEffort === "high" || body.reasoningEffort === "max") {
    patch.reasoningEffort = body.reasoningEffort;
  }
  if (typeof body.workspace === "string" && body.workspace.trim()) {
    patch.workspace = body.workspace.trim();
  }
  if (typeof body.baseUrl === "string" && body.baseUrl.trim()) {
    patch.baseUrl = body.baseUrl.trim();
  }
  const next = await saveSettings(patch);
  if (patch.workspace) await restartAllShells();
  return NextResponse.json(publicSettings(next));
}
