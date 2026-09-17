import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getWorkspaceRoot, pathExists, resolveSafe, toPosix } from "@/lib/workspace";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { from?: string; to?: string };
    if (!body.from || !body.to) return NextResponse.json({ error: "from and to required" }, { status: 400 });
    const root = await getWorkspaceRoot();
    const src = resolveSafe(root, body.from);
    const dest = resolveSafe(root, body.to);
    if (!(await pathExists(src))) return NextResponse.json({ error: "Source not found" }, { status: 404 });
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(src, dest);
    return NextResponse.json({ from: toPosix(root, src), to: toPosix(root, dest), ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
