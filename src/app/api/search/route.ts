import { NextResponse } from "next/server";
import { replaceInWorkspace, searchWorkspace } from "@/lib/search";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") ?? "";
  const pathGlob = url.searchParams.get("glob") ?? undefined;
  const caseSensitive = url.searchParams.get("case") === "1";
  const useRegex = url.searchParams.get("regex") === "1";
  const wholeWord = url.searchParams.get("word") === "1";
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? "80");

  try {
    const result = await searchWorkspace({
      query,
      pathGlob: pathGlob || undefined,
      caseSensitive,
      // Search panel defaults to literal text; agent tool still defaults to regex.
      useRegex,
      wholeWord,
      offset: Number.isFinite(offset) ? offset : 0,
      limit: Number.isFinite(limit) ? limit : 80,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error, hits: [], total: 0, truncated: false }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed", hits: [], total: 0, truncated: false },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      query?: string;
      replace?: string;
      glob?: string;
      caseSensitive?: boolean;
      useRegex?: boolean;
      wholeWord?: boolean;
      paths?: string[];
    };
    const result = await replaceInWorkspace({
      query: body.query ?? "",
      replace: body.replace ?? "",
      pathGlob: body.glob || undefined,
      caseSensitive: Boolean(body.caseSensitive),
      useRegex: Boolean(body.useRegex),
      wholeWord: Boolean(body.wholeWord),
      paths: body.paths,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        filesChanged: 0,
        replacements: 0,
        changedFiles: [],
        error: error instanceof Error ? error.message : "Replace failed",
      },
      { status: 500 },
    );
  }
}
