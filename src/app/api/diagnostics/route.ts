import { NextResponse } from "next/server";
import { executeTool } from "@/lib/tools";

export type Diagnostic = {
  path: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  code: string;
  message: string;
};

function parseTsc(output: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const re = /^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+(\w+):\s+(.*)$/;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    const m = re.exec(line);
    if (!m) continue;
    out.push({
      path: m[1].replace(/\\/g, "/"),
      line: Number(m[2]),
      column: Number(m[3]),
      severity: m[4] === "warning" ? "warning" : "error",
      code: m[5],
      message: m[6],
    });
  }
  return out;
}

export async function GET() {
  const result = await executeTool("get_diagnostics", "{}");
  const items = parseTsc(result.output);
  return NextResponse.json({
    ok: result.ok,
    raw: items.length ? undefined : result.output.slice(0, 2000),
    items,
  });
}
