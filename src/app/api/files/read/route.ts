import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { languageFromPath } from "@/lib/ignore";
import { getWorkspaceRoot, resolveSafe, toPosix } from "@/lib/workspace";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rel = url.searchParams.get("path");
    if (!rel) return NextResponse.json({ error: "path required" }, { status: 400 });
    const root = await getWorkspaceRoot();
    const abs = resolveSafe(root, rel);
    const content = await fs.readFile(abs, "utf8");
    return NextResponse.json({
      path: toPosix(root, abs),
      content,
      language: languageFromPath(abs),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
