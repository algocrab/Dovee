import { NextResponse } from "next/server";
import { formatCode, formatterVersion } from "@/lib/format";

export const runtime = "nodejs";

/** Reports which prettier would be used, for the settings UI. */
export async function GET() {
  const version = await formatterVersion();
  return NextResponse.json({ available: version !== null, version });
}

/** Formats a buffer and returns the text — writing stays with /api/files/write. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { path?: string; content?: string };
    if (!body.path) {
      return NextResponse.json({ ok: false, error: "path required" }, { status: 400 });
    }
    if (typeof body.content !== "string") {
      return NextResponse.json({ ok: false, error: "content required" }, { status: 400 });
    }
    return NextResponse.json(await formatCode({ path: body.path, content: body.content }));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Format failed" },
      { status: 500 },
    );
  }
}
