"use client";

import { Loader2, Paperclip, Plus, Square, WandSparkles, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type MutableRefObject,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import { ACCEPT_FILES, filesToAttachments, userApiContent } from "@/lib/chat-attachments";
import { formatUsage } from "@/lib/llm";
import { useIde, type ChatAttachment, type ChatMsg, type ChatUsage, type ToolCard } from "@/stores/ide-store";
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
        <span className="min-w-0 flex-1 truncate text-muted">
          {tool.arguments.replace(/\s+/g, " ").slice(0, 80)}
        </span>
      </button>
      {open && tool.output && (
        <pre className="max-h-48 overflow-auto border-t border-line px-2.5 py-2 font-mono text-[10px] text-muted whitespace-pre-wrap">
          {tool.output.slice(0, 4000)}
        </pre>
      )}
    </div>
  );
}

function ToolSummary({ tools }: { tools: ToolCard[] }) {
  const [open, setOpen] = useState(false);
  const running = tools.some((tool) => tool.status === "running");
  const errors = tools.filter((tool) => tool.status === "error").length;
  const reads = tools.filter((tool) => /read|list|search|tree/i.test(tool.name)).length;
  const writes = tools.filter((tool) => /write|edit|rename|delete|mkdir/i.test(tool.name)).length;
  const parts = [
    reads ? `${reads} read` : "",
    writes ? `${writes} changed` : "",
    !reads && !writes ? `${tools.length} action${tools.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return (
    <div className="overflow-hidden rounded-lg border border-line/70 bg-bg/35">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-muted hover:bg-hover"
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            running ? "animate-pulse bg-gold" : errors ? "bg-rose" : "bg-green",
          )}
        />
        <span className="truncate">{running ? "Working in the background" : parts.join(" · ")}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted/70">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="space-y-1 border-t border-line/70 p-1.5">
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}

function fmtTok(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

function Message({ msg }: { msg: ChatMsg }) {
  if (msg.role === "user") {
    const images = msg.attachments?.filter((a) => a.kind === "image" && a.dataUrl) ?? [];
    const files = msg.attachments?.filter((a) => a.kind === "text") ?? [];
    return (
      <div className="ml-6 space-y-2 rounded-xl border border-line bg-bg-3/80 px-3 py-2 text-[13px] leading-relaxed">
        {msg.content ? <div className="whitespace-pre-wrap">{msg.content}</div> : null}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((image) => (
              // biome-ignore lint/performance/noImgElement: pasted/attached data URLs cannot use next/image
              <img
                key={image.id}
                src={image.dataUrl}
                alt={image.name}
                className="max-h-40 max-w-full rounded-lg border border-line object-contain"
              />
            ))}
          </div>
        )}
        {files.map((file) => (
          <p key={file.id} className="font-mono text-[11px] text-muted">
            {file.name}
          </p>
        ))}
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
      {msg.tools.length > 0 && <ToolSummary tools={msg.tools} />}
      {msg.content && (
        <div className="markdown-body text-[13px] leading-relaxed">
          <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
        </div>
      )}
      {msg.usage && (msg.usage.total_tokens || msg.usage.cost_usd != null) ? (
        <p
          className="font-mono text-[10px] text-muted/80"
          title="Tokens and cost for this turn (all tool rounds summed)"
        >
          {formatUsage(msg.usage, { estimated: Boolean(msg.usage.estimated) })}
          {msg.usage.prompt_tokens != null && msg.usage.completion_tokens != null
            ? ` · in ${fmtTok(msg.usage.prompt_tokens)} / out ${fmtTok(msg.usage.completion_tokens)}`
            : null}
        </p>
      ) : null}
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
  const [pending, setPending] = useState<Record<string, ChatAttachment[]>>({});
  const [dragging, setDragging] = useState(false);
  const draft = useIde((s) => s.drafts[activeChatId] ?? "");
  const focusToken = useIde((s) => s.composerFocusToken);
  const attachments = pending[activeChatId] ?? [];
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(pending);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  // "Add to chat" writes straight into the store draft and bumps composerFocusToken,
  // so focus is requested here without stealing it on every keystroke.
  const lastFocusToken = useRef(focusToken);
  useEffect(() => {
    if (focusToken === lastFocusToken.current) return;
    lastFocusToken.current = focusToken;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusToken]);

  useEffect(() => {
    if (!stickToBottom.current) return;
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [chat?.messages, chat?.streaming, activeChatId]);

  const addFiles = useCallback(async (fileList: File[]) => {
    if (!fileList.length) return;
    const chatId = useIde.getState().activeChatId;
    const existing = pendingRef.current[chatId]?.length ?? 0;
    const { attachments: added, errors } = await filesToAttachments(fileList, existing);
    if (errors[0]) useIde.getState().setStatus(errors[0]);
    if (!added.length) return;
    setPending((current) => ({ ...current, [chatId]: [...(current[chatId] ?? []), ...added] }));
  }, []);

  async function send() {
    const text = draft.trim();
    const chatId = useIde.getState().activeChatId;
    const current = useIde.getState().chats.find((c) => c.id === chatId);
    const files = pendingRef.current[chatId] ?? [];
    if ((!text && files.length === 0) || !chatId || current?.streaming) return;
    useIde.getState().setDraft(chatId, "");
    setPending((p) => ({ ...p, [chatId]: [] }));
    const store = useIde.getState();
    store.addUserMessage(chatId, text, files);
    store.ensureAssistant(chatId);
    store.setChatStreaming(chatId, true);
    store.setStatus("Dovee is working…");

    const history: Array<Record<string, unknown>> = [];
    const after = useIde.getState().chats.find((c) => c.id === chatId);
    // Keep the prompt bounded: recent turns beat a full tool transcript replay.
    // Last message is the empty assistant placeholder — exclude it.
    const prior = (after?.messages ?? []).slice(0, -1);
    const windowed = prior.slice(-12);
    // Only the newest assistant turns keep tool transcripts.
    const toolKeepFrom = Math.max(0, windowed.length - 4);

    for (let index = 0; index < windowed.length; index++) {
      const m = windowed[index];
      if (m.role === "user") {
        // Base64 images are huge — only re-send them on the latest user turn.
        const isLatestUser = !windowed.slice(index + 1).some((x) => x.role === "user");
        if (isLatestUser) {
          history.push({ role: "user", content: userApiContent(m.content, m.attachments) });
        } else {
          const textOnly = (m.attachments ?? []).filter((a) => a.kind === "text");
          const imageNames = (m.attachments ?? []).filter((a) => a.kind === "image").map((a) => a.name);
          let content = userApiContent(m.content, textOnly);
          if (imageNames.length) {
            const note = `[Earlier message included image(s): ${imageNames.join(", ")}]`;
            content = typeof content === "string" ? (content ? `${content}\n\n${note}` : note) : content;
          }
          history.push({ role: "user", content });
        }
        continue;
      }

      const includeTools = index >= toolKeepFrom;
      const toolCalls = includeTools
        ? m.tools
            .filter((t) => t.id && t.name)
            .map((t) => ({
              id: t.id,
              type: "function" as const,
              function: { name: t.name, arguments: t.arguments || "{}" },
            }))
        : [];

      if (!m.content && toolCalls.length === 0) {
        if (!includeTools && m.tools.length) {
          history.push({
            role: "assistant",
            content: `[Completed ${m.tools.length} tool call(s) in an earlier turn.]`,
          });
        }
        continue;
      }

      history.push({
        role: "assistant",
        content: m.content || (toolCalls.length ? null : ""),
        // Thinking traces are large and rarely help on later turns.
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
      if (!includeTools) continue;
      for (const t of m.tools) {
        if (t.output === undefined) continue;
        history.push({
          role: "tool",
          tool_call_id: t.id,
          content: t.output.length > 800 ? `${t.output.slice(0, 700)}\n[…output truncated]` : t.output,
        });
      }
    }

    const controller = new AbortController();
    abortRef.current.set(chatId, controller);
    let turnUsage: ChatUsage | undefined;

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
          if (ev === "done") {
            const raw = data.usage as ChatUsage | undefined;
            if (raw && (raw.total_tokens || raw.prompt_tokens || raw.cost_usd != null)) {
              turnUsage = raw;
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        useIde.getState().appendContent(chatId, `\n\n**Error:** ${(error as Error).message}`);
      }
    } finally {
      abortRef.current.delete(chatId);
      const s = useIde.getState();
      s.setChatStreaming(chatId, false);
      if (turnUsage) {
        s.setMessageUsage(chatId, turnUsage);
        const label = formatUsage(turnUsage, { estimated: Boolean(turnUsage.estimated) });
        s.setStatus(label ? `Ready · ${label}` : "Ready");
      } else if (s.status === "Dovee is working…" || s.status.startsWith("Ready")) {
        s.setStatus("Ready");
      }
    }
  }

  function stop() {
    const id = useIde.getState().activeChatId;
    abortRef.current.get(id)?.abort();
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files: File[] = [];
    for (const item of event.clipboardData?.items ?? []) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (!files.length && event.clipboardData?.files?.length) {
      files.push(...Array.from(event.clipboardData.files));
    }
    if (!files.length) return;
    event.preventDefault();
    const pasted = event.clipboardData.getData("text/plain");
    if (pasted) {
      const current = useIde.getState().drafts[activeChatId] ?? "";
      useIde.getState().setDraft(activeChatId, `${current}${pasted}`);
    }
    void addFiles(files);
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files ?? []));
  }

  function removeAttachment(id: string) {
    setPending((current) => ({
      ...current,
      [activeChatId]: (current[activeChatId] ?? []).filter((item) => item.id !== id),
    }));
  }

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const list = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    void addFiles(list);
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
                c.id === activeChatId ? "bg-gold/15 text-gold" : "text-muted hover:bg-hover",
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
          className="shrink-0 rounded p-1 text-muted hover:bg-hover hover:text-text"
          title="New chat"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        }}
        className="min-h-0 flex-1 space-y-4 overflow-auto px-3 py-3"
      >
        {messages.length === 0 && (
          <div className="mt-6 space-y-4 text-center">
            <p className="text-sm font-medium text-text">What should we build?</p>
            <p className="text-xs leading-relaxed text-muted">
              Dovee reads your repo, edits files, and runs commands with any model API you connect.
            </p>
            {!hasKey && (
              <button
                type="button"
                onClick={() => useIde.getState().setSettingsOpen(true)}
                className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-gold hover:bg-gold/20"
              >
                Add an API key
              </button>
            )}
            <div className="flex flex-col gap-1.5 pt-1">
              {["Give me a tour of this repo", "Find obvious bugs", "Improve the current UI"].map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onClick={() => useIde.getState().setDraft(activeChatId, hint)}
                  className="rounded-lg border border-line bg-bg/40 px-3 py-2 text-left text-[12px] text-muted hover:border-teal/30 hover:bg-hover hover:text-text"
                >
                  {hint}
                </button>
              ))}
            </div>
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
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT_FILES}
          className="hidden"
          onChange={onPickFiles}
        />
        <div
          className={cn(
            "rounded-xl border bg-bg-2 focus-within:border-teal/40 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--teal)_14%,transparent)]",
            dragging ? "border-teal/60 bg-teal/5" : "border-line",
          )}
        >
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pt-2">
              {attachments.map((item) => (
                <span
                  key={item.id}
                  className="flex max-w-full items-center gap-1 rounded-lg border border-line bg-bg px-1.5 py-1"
                >
                  {item.kind === "image" && item.dataUrl ? (
                    // biome-ignore lint/performance/noImgElement: pasted/attached data URLs cannot use next/image
                    <img src={item.dataUrl} alt={item.name} className="h-8 w-8 rounded object-cover" />
                  ) : null}
                  <span className="max-w-[140px] truncate font-mono text-[10px] text-muted">{item.name}</span>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted hover:bg-hover hover:text-text"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => removeAttachment(item.id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => useIde.getState().setDraft(activeChatId, e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={3}
            placeholder={dragging ? "Drop files here…" : "Ask Dovee… paste or attach images and files"}
            className="w-full resize-none bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted/70"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                title="Attach images or files"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-md border border-line bg-bg px-2 py-1 text-[11px] text-muted hover:border-teal/40 hover:bg-hover hover:text-text"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Attach
              </button>
              <span className="truncate font-mono text-[10px] text-muted">or paste / drop</span>
            </div>
            {streaming ? (
              <button type="button" onClick={stop} className="rounded-md bg-rose/15 px-2 py-1 text-[11px] text-rose">
                <Square className="mr-1 inline h-3 w-3" />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim() && attachments.length === 0}
                className="rounded-md bg-teal/20 px-2.5 py-1 text-[11px] text-teal hover:bg-teal/30 disabled:opacity-40"
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
