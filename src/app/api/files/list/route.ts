import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isIgnoredName } from "@/lib/ignore";
import { getWorkspaceRoot, toPosix } from "@/lib/workspace";

async function walk(root: string, dir: string, out: string[]) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (isIgnoredName(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, abs, out);
    } else {
      out.push(toPosix(root, abs));
    }
  }
}

export async function GET() {
  try {
    const root = await getWorkspaceRoot();
    const files: string[] = [];
    await walk(root, root, files);
    return NextResponse.json({ files });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
