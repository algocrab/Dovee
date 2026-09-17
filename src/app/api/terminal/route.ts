import { NextResponse } from "next/server";
import { killShell, resizeShell, restartShell, subscribeShell, writeShell } from "@/lib/shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function termId(req: Request, body?: { id?: string }) {
  const fromQuery = new URL(req.url).searchParams.get("id");
  return body?.id || fromQuery || "term-1";
}

function termSize(req: Request) {
  const params = new URL(req.url).searchParams;
  const cols = Number(params.get("cols"));
  const rows = Number(params.get("rows"));
  return {
    cols: Number.isFinite(cols) && cols > 0 ? cols : undefined,
    rows: Number.isFinite(rows) && rows > 0 ? rows : undefined,
  };
}

export async function GET(req: Request) {
  const id = termId(req);
  const size = termSize(req);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
        } catch {
          /* closed */
        }
      };
      const unsub = await subscribeShell(id, send, size.cols, size.rows);
      send(`\x1b[38;2;125;211;192mDovee shell\x1b[0m — ${id}\r\n`);
      const timer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(timer);
          unsub();
        }
      }, 15000);
      const onAbort = () => {
        clearInterval(timer);
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
    },
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    id?: string;
    data?: string;
    restart?: boolean;
    kill?: boolean;
    cols?: number;
    rows?: number;
  };
  const id = termId(req, body);
  if (body.kill) {
    await killShell(id);
    return NextResponse.json({ ok: true, killed: true });
  }
  if (body.restart) {
    await restartShell(id);
    return NextResponse.json({ ok: true, restarted: true });
  }
  if (typeof body.cols === "number" && typeof body.rows === "number") {
    await resizeShell(id, body.cols, body.rows);
  }
  if (typeof body.data === "string") {
    await writeShell(id, body.data);
  }
  return NextResponse.json({ ok: true });
}
