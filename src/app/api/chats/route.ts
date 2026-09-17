import { NextResponse } from "next/server";
import { loadChats, saveChats } from "@/lib/chats";
import type { AgentChat } from "@/types/chat";

export async function GET() {
  return NextResponse.json(await loadChats());
}

export async function POST(req: Request) {
  const body = (await req.json()) as { chats?: AgentChat[]; activeChatId?: string };
  try {
    await saveChats({
      chats: Array.isArray(body.chats) ? body.chats : [],
      activeChatId: typeof body.activeChatId === "string" ? body.activeChatId : "",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
