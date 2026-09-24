import { NextResponse } from "next/server";
import { listRecoverySnapshots } from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshots = await listRecoverySnapshots();
  return NextResponse.json({
    ok: true,
    snapshots: snapshots.map(({ id, path, createdAt }) => ({ id, path, createdAt })),
  });
}
