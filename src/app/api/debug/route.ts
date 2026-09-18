import { NextResponse } from "next/server";
import {
  canDebugPath,
  debugCommand,
  loadFrame,
  snapshot,
  startDebug,
  stopDebug,
  subscribeDebug,
  syncBreakpoints,
} from "@/lib/debug";
import type { Breakpoint } from "@/types/debug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asBreakpoints(value: unknown): Breakpoint[] {
  if (!Array.isArray(value)) return [];
  const out: Breakpoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<Breakpoint>;
    if (typeof row.path !== "string" || typeof row.line !== "number") continue;
    out.push({
      id: typeof row.id === "string" ? row.id : `${row.path}:${row.line}`,
      path: row.path,
      line: row.line,
      enabled: row.enabled !== false,
    });
  }
  return out;
}

function asArgs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [];
  return value.trim().split(/\s+/).slice(0, 20);
}

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          /* closed */
        }
      };
      const unsub = subscribeDebug(send);
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(heartbeat);
          unsub();
        }
      }, 15_000);
      const onAbort = () => {
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", onAbort);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    action?: string;
    path?: string;
    args?: string;
    breakpoints?: unknown;
    frameId?: string;
  };
  const action = body.action ?? "";
  try {
    if (action === "start") {
      const filePath = String(body.path ?? "");
      if (!canDebugPath(filePath)) {
        return NextResponse.json({ ok: false, error: "Open a JavaScript or TypeScript file to debug" }, { status: 400 });
      }
      await startDebug(filePath, asBreakpoints(body.breakpoints), asArgs(body.args));
      return NextResponse.json({ ok: true, ...snapshot() });
    }
    if (action === "stop") {
      await stopDebug();
      return NextResponse.json({ ok: true });
    }
    if (action === "continue" || action === "pause" || action === "stepOver" || action === "stepInto" || action === "stepOut") {
      await debugCommand(action);
      return NextResponse.json({ ok: true });
    }
    if (action === "frame") {
      await loadFrame(String(body.frameId ?? ""));
      return NextResponse.json({ ok: true });
    }
    if (action === "breakpoints") {
      await syncBreakpoints(asBreakpoints(body.breakpoints));
      return NextResponse.json({ ok: true });
    }
    if (action === "status") {
      return NextResponse.json({ ok: true, ...snapshot() });
    }
    return NextResponse.json({ ok: false, error: "Unknown debug action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
