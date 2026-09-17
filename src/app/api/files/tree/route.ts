import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { listDir, resolveSafe, toPosix } from "@/lib/workspace";
import { getWorkspaceRoot } from "@/lib/workspace";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rel = url.searchParams.get("path") || ".";
    const root = await getWorkspaceRoot();
    const abs = resolveSafe(root, rel);
    const stat = await fs.stat(abs);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Not a directory" }, { status: 400 });
    }
    const entries = await listDir(abs);
    return NextResponse.json({
      path: toPosix(root, abs),
      entries: entries.map((e) => ({
        name: e.name,
        path: toPosix(root, path.join(abs, e.name)),
        type: e.isDirectory() ? "dir" : "file",
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
