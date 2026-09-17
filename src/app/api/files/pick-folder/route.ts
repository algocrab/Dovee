import { NextResponse } from "next/server";
import { pickFolderDialog } from "@/lib/pick-folder";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { startPath?: string };
    const startPath = typeof body.startPath === "string" ? body.startPath : undefined;
    const picked = await pickFolderDialog(startPath);
    if (!picked) return NextResponse.json({ cancelled: true });
    return NextResponse.json({ path: picked });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not open the folder picker" },
      { status: 500 },
    );
  }
}
