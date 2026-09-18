import { NextResponse } from "next/server";
import {
  listExtensions,
  reloadExtensions,
  runExtensionCommand,
  scaffoldSampleExtension,
  toggleExtension,
} from "@/lib/extensions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const extensions = await listExtensions();
    return NextResponse.json({ ok: true, extensions });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as { action?: string; id?: string; commandId?: string; enabled?: boolean };
  const action = body.action ?? "";
  try {
    if (action === "reload") {
      return NextResponse.json({ ok: true, extensions: await reloadExtensions() });
    }
    if (action === "scaffold") {
      return NextResponse.json({ ok: true, extensions: await scaffoldSampleExtension() });
    }
    if (action === "toggle") {
      const id = String(body.id ?? "");
      const extensions = await toggleExtension(id, body.enabled !== false);
      return NextResponse.json({ ok: true, extensions });
    }
    if (action === "run") {
      const result = await runExtensionCommand(String(body.commandId ?? ""));
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, status: result.status, openPath: result.openPath });
    }
    return NextResponse.json({ ok: false, error: "Unknown extensions action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
