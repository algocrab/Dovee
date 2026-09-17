import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentChat } from "@/types/chat";

const CHATS_DIR = path.join(os.homedir(), ".dovee");
const CHATS_FILE = path.join(CHATS_DIR, "chats.json");
const MAX_CHATS = 40;

export type ChatsFile = {
  chats: AgentChat[];
  activeChatId: string;
};

function isChat(value: unknown): value is AgentChat {
  if (!value || typeof value !== "object") return false;
  const chat = value as AgentChat;
  return typeof chat.id === "string" && typeof chat.title === "string" && Array.isArray(chat.messages);
}

// A reload can land mid-stream, so stored runs are always settled down.
function sanitize(chat: AgentChat): AgentChat {
  return {
    ...chat,
    streaming: false,
    messages: chat.messages.map((m) => ({
      ...m,
      tools: (m.tools ?? []).map((t) =>
        t.status === "running"
          ? { ...t, status: "error" as const, ok: false, output: t.output ?? "Interrupted before it finished" }
          : t,
      ),
    })),
  };
}

export async function loadChats(): Promise<ChatsFile> {
  try {
    const raw = await fs.readFile(CHATS_FILE, "utf8");
    const stored = JSON.parse(raw) as Partial<ChatsFile>;
    return {
      chats: (Array.isArray(stored.chats) ? stored.chats : []).filter(isChat).map(sanitize),
      activeChatId: typeof stored.activeChatId === "string" ? stored.activeChatId : "",
    };
  } catch {
    return { chats: [], activeChatId: "" };
  }
}

export async function saveChats(file: ChatsFile) {
  const chats = file.chats.filter(isChat).slice(-MAX_CHATS).map(sanitize);
  await fs.mkdir(CHATS_DIR, { recursive: true });
  await fs.writeFile(CHATS_FILE, JSON.stringify({ chats, activeChatId: file.activeChatId }), "utf8");
}
