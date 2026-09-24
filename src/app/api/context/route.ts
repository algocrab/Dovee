import { NextResponse } from "next/server";
import { queryWorkspaceContext } from "@/lib/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") ?? "";
  const activeFile = url.searchParams.get("activeFile") ?? undefined;
  const refresh = url.searchParams.get("refresh") === "1";
  const files = await queryWorkspaceContext(query, activeFile, refresh);
  return NextResponse.json({ ok: true, files, query, refreshed: refresh });
}
