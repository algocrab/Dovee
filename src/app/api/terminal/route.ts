import { NextResponse } from "next/server";
import { restartShell, subscribeShell, writeShell } from "@/lib/shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
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
      const unsub = await subscribeShell(send);
      send("\x1b[38;2;125;211;192mDovee shell\x1b[0m — PowerShell in workspace\r\n");
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
  const body = (await req.json()) as { data?: string; restart?: boolean };
  if (body.restart) {
    await restartShell();
    return NextResponse.json({ ok: true, restarted: true });
  }
  if (typeof body.data === "string") {
    await writeShell(body.data);
  }
  return NextResponse.json({ ok: true });
}
