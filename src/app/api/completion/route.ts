import { NextResponse } from "next/server";
import { requestCompletion, type CompletionRequest } from "@/lib/completion";
import { loadSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<CompletionRequest>;
  if (
    typeof body.prefix !== "string" ||
    typeof body.suffix !== "string" ||
    typeof body.language !== "string" ||
    typeof body.filePath !== "string"
  ) {
    return NextResponse.json({ ok: false, error: "Invalid completion context" }, { status: 400 });
  }

  const settings = await loadSettings();
  if (!settings.completionEnabled) return NextResponse.json({ ok: false, error: "Completion is disabled" });
  if (settings.completionExcludedPaths.some((path) => body.filePath?.startsWith(path))) {
    return NextResponse.json({ ok: false, error: "Path is excluded" });
  }
  const result = await requestCompletion(settings, body as CompletionRequest, req.signal);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
