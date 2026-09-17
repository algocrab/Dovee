import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getWorkspaceRoot, resolveSafe, toPosix } from "@/lib/workspace";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { path?: string; content?: string };
    if (!body.path) return NextResponse.json({ error: "path required" }, { status: 400 });
    const root = await getWorkspaceRoot();
    const abs = resolveSafe(root, body.path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body.content ?? "", "utf8");
    return NextResponse.json({ path: toPosix(root, abs), ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
