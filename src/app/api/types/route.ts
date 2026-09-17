import { NextResponse } from "next/server";
import { getPackageTypeLibs, getTypeBundle } from "@/lib/type-libs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Base bundle: compiler options + project sources + essential ambient types. */
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

/**
 * On-demand package types. Body: `{ packages: string[] }` where each entry is a
 * bare package name extracted from the open buffer's imports (`react`, `next`, ...).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { packages?: unknown };
    const packages = Array.isArray(body.packages)
      ? body.packages.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [];
    if (packages.length === 0) {
      return NextResponse.json({ ok: true, libs: [], stats: { packages: 0, files: 0, bytes: 0, skipped: 0 } });
    }
    // Cap how many packages a single request can pull, to keep a bad client
    // from asking for the entire node_modules tree.
    const limited = packages.slice(0, 30);
    const result = await getPackageTypeLibs(limited);
    return NextResponse.json({ ok: true, libs: result.libs, stats: result.stats });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "failed to load package types" },
      { status: 500 },
    );
  }
}
