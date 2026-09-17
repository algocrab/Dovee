"use client";

import { Loader2, Plus, Square, WandSparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import { useIde, type ChatMsg, type ToolCard } from "@/stores/ide-store";
import { openFile, refreshRoot } from "./file-tree";

function ToolRow({ tool }: { tool: ToolCard }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bg/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[11px]"
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tool.status === "running" && "animate-pulse bg-gold",
            tool.status === "done" && "bg-green",
            tool.status === "error" && "bg-rose",
          )}
        />
        <span className="text-gold">{tool.name}</span>
        <span className="min-w-0 flex-1 truncate text-muted">{tool.arguments.replace(/\s+/g, " ").slice(0, 80)}</span>
      </button>
      {open && tool.output && (
        <pre className="max-h-48 overflow-auto border-t border-line px-2.5 py-2 font-mono text-[10px] text-muted whitespace-pre-wrap">
          {tool.output.slice(0, 4000)}
        </pre>
      )}
    </div>
  );
}

function Message({ msg }: { msg: ChatMsg }) {
  if (msg.role === "user") {
    return (
      <div className="ml-6 rounded-xl border border-line bg-bg-3/80 px-3 py-2 text-[13px] leading-relaxed">
        {msg.content}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {msg.thinking && (
        <details className="rounded-lg border border-line/80 bg-bg/40 px-2.5 py-1.5 text-[11px] text-muted">
          <summary className="cursor-pointer select-none text-gold/90">Thinking</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px]">{msg.thinking}</pre>
        </details>
      )}
      {msg.tools.map((tool) => (
        <ToolRow key={tool.id} tool={tool} />
      ))}
      {msg.content && (
        <div className="markdown-body text-[13px] leading-relaxed">
          <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
        </div>
      )}
    </div>
  );
}

export function AgentPanel({ abortRef }: { abortRef: MutableRefObject<Map<string, AbortController>> }) {
  const chats = useIde((s) => s.chats);
  const activeChatId = useIde((s) => s.activeChatId);
  const chat = chats.find((c) => c.id === activeChatId) ?? chats[0];
  const messages = chat?.messages ?? [];
  const streaming = chat?.streaming ?? false;
  const hasKey = useIde((s) => s.settings?.hasApiKey);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draft = drafts[activeChatId] ?? "";
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [chat?.messages, chat?.streaming, activeChatId]);

  async function send() {
    const text = draft.trim();
    const chatId = useIde.getState().activeChatId;
    const current = useIde.getState().chats.find((c) => c.id === chatId);
    if (!text || !chatId || current?.streaming) return;
    setDrafts((d) => ({ ...d, [chatId]: "" }));
    const store = useIde.getState();
    store.addUserMessage(chatId, text);
    store.ensureAssistant(chatId);
    store.setChatStreaming(chatId, true);
    store.setStatus("Dovee is working…");

    const history: Array<Record<string, unknown>> = [];
    const after = useIde.getState().chats.find((c) => c.id === chatId);
    for (const m of (after?.messages ?? []).slice(0, -1)) {
      if (m.role === "user") {
        history.push({ role: "user", content: m.content });
        continue;
      }
      history.push({
        role: "assistant",
        content: m.content || null,
        reasoning_content: m.thinking || null,
        tool_calls: m.tools.length
          ? m.tools.map((t) => ({
              id: t.id,
              type: "function",
              function: { name: t.name, arguments: t.arguments },
            }))
          : undefined,
      });
      for (const t of m.tools) {
        if (t.output === undefined) continue;
        history.push({ role: "tool", tool_call_id: t.id, content: t.output });
      }
    }

    const controller = new AbortController();
    abortRef.current.set(chatId, controller);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: history,
          activeFile: store.activePath,
          openTabs: store.tabs.map((t) => t.path),
        }),
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const ev = /event: (\w+)/.exec(chunk)?.[1];
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!ev || !dataLine) continue;
          const data = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
          const s = useIde.getState();
          if (ev === "thinking") s.appendThinking(chatId, String(data.text ?? ""));
          if (ev === "content") s.appendContent(chatId, String(data.text ?? ""));
          if (ev === "tool_start") {
            s.startTool(chatId, {
              id: String(data.id),
              name: String(data.name),
              arguments: String(data.arguments ?? ""),
              status: "running",
            });
          }
          if (ev === "tool_result") {
            s.finishTool(chatId, String(data.id), Boolean(data.ok), String(data.output ?? ""));
            const changed = data.changedFiles as string[] | undefined;
            if (changed?.length) {
              await refreshRoot();
              for (const path of changed) {
                const open = s.tabs.some((t) => t.path === path);
                if (open) {
                  const file = await fetch(`/api/files/read?path=${encodeURIComponent(path)}`).then((r) => r.json());
                  if (file.content !== undefined) s.reloadTab(path, file.content);
                } else {
                  await openFile(path);
                }
              }
            }
          }
          if (ev === "error") {
            s.appendContent(chatId, `\n\n**Error:** ${String(data.message)}`);
            s.setStatus(String(data.message));
          }
          if (ev === "done") s.setStatus("Ready");
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        useIde.getState().appendContent(chatId, `\n\n**Error:** ${(error as Error).message}`);
      }
    } finally {
      abortRef.current.delete(chatId);
      useIde.getState().setChatStreaming(chatId, false);
      useIde.getState().setStatus("Ready");
    }
  }

  function stop() {
    const id = useIde.getState().activeChatId;
    abortRef.current.get(id)?.abort();
  }

  return (
    <div className="flex h-full flex-col border-l border-line bg-bg-1">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <WandSparkles className="h-3.5 w-3.5 shrink-0 text-gold" />
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {chats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => useIde.getState().setActiveChat(c.id)}
              className={cn(
                "group flex max-w-[140px] items-center gap-1 rounded px-2 py-1 text-[11px]",
                c.id === activeChatId ? "bg-gold/15 text-gold" : "text-muted hover:bg-white/5",
              )}
              title={c.title}
            >
              <span className="truncate">{c.title}</span>
              {c.streaming && <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin" />}
              <X
                className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-80"
                onClick={(e) => {
                  e.stopPropagation();
                  abortRef.current.get(c.id)?.abort();
                  useIde.getState().closeChat(c.id);
                }}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => useIde.getState().newChat()}
          className="shrink-0 rounded p-1 text-muted hover:bg-white/5 hover:text-text"
          title="New chat"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="mt-8 space-y-3 text-center">
            <p className="text-sm text-text">What should we build?</p>
            <p className="text-xs text-muted">
              Dovee reads your repo, edits files, and runs commands with DeepSeek V4.1 Flash.
            </p>
            {!hasKey && (
              <button
                type="button"
                onClick={() => useIde.getState().setSettingsOpen(true)}
                className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-gold"
              >
                Add DeepSeek API key
              </button>
            )}
          </div>
        )}
        {messages.map((msg) => (
          <Message key={msg.id} msg={msg} />
        ))}
        {streaming && (
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <Loader2 className="h-3 w-3 animate-spin text-gold" />
            working
          </div>
        )}
      </div>
      <form
        className="border-t border-line p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="rounded-xl border border-line bg-bg-2 focus-within:border-teal/35">
          <textarea
            value={draft}
            onChange={(e) => setDrafts((d) => ({ ...d, [activeChatId]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={3}
            placeholder="Ask Dovee to edit this project…"
            className="w-full resize-none bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted/70"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="font-mono text-[10px] text-muted">Enter send · Shift+Enter newline</span>
            {streaming ? (
              <button type="button" onClick={stop} className="rounded-md bg-rose/15 px-2 py-1 text-[11px] text-rose">
                <Square className="mr-1 inline h-3 w-3" />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                className="rounded-md bg-teal/15 px-2.5 py-1 text-[11px] text-teal disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
