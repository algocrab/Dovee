import { NextResponse } from "next/server";
import { executeTool } from "@/lib/tools";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") || "";
  const glob = url.searchParams.get("glob") || undefined;
  if (!query) return NextResponse.json({ hits: [] });
  const result = await executeTool(
    "search_codebase",
    JSON.stringify({ query, path_glob: glob }),
  );
  const hits = result.output
    .split("\n")
    .filter((line) => line && line !== "No matches.")
    .map((line) => {
      const match = /^(.+?):(\d+): (.*)$/.exec(line);
      if (!match) return { path: "", line: 0, text: line };
      return { path: match[1], line: Number(match[2]), text: match[3] };
    });
  return NextResponse.json({ hits, ok: result.ok });
}
