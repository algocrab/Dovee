import { NextResponse } from "next/server";
import { getTypeBundle } from "@/lib/type-libs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bundle = await getTypeBundle();
    return NextResponse.json({
      ok: true,
      compilerOptions: bundle.compilerOptions,
      libs: bundle.libs,
      stats: bundle.stats,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "failed to load types" },
      { status: 500 },
    );
  }
}
