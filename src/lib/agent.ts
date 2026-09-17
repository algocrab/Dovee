import { streamChat, type ChatMessage, type ToolCall } from "./llm";
import { getProvider } from "./providers";
import { loadSettings } from "./settings";
import { buildSystemPrompt } from "./system-prompt";
import { executeTool, TOOL_SCHEMAS } from "./tools";

export type AgentEvent =
  | { type: "thinking"; text: string }
  | { type: "content"; text: string }
  | { type: "tool_start"; id: string; name: string; arguments: string }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      output: string;
      changedFiles?: string[];
    }
  | { type: "done"; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }
  | { type: "error"; message: string };

const MAX_ROUNDS = 24;

export async function* runAgent(
  history: ChatMessage[],
  extras: { activeFile?: string; openTabs?: string[] },
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const settings = await loadSettings();
  if (!settings.apiKey) {
    const provider = getProvider(settings.provider);
    yield {
      type: "error",
      message: `No API key for ${provider.label}. Open Settings and paste a key${provider.docs ? ` from ${provider.docs}` : ""}.`,
    };
    return;
  }

  const system = await buildSystemPrompt();
  const contextBits = [
    extras.activeFile ? `Active file: ${extras.activeFile}` : "",
    extras.openTabs?.length ? `Open tabs: ${extras.openTabs.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: system + (contextBits ? `\n\n${contextBits}` : "") },
    ...history.filter((m) => m.role !== "system"),
  ];

  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (signal?.aborted) return;

    let reasoning = "";
    let content = "";
    let toolCalls: ToolCall[] | undefined;
    let finish: string | null | undefined;

    try {
      for await (const delta of streamChat({
        settings,
        messages,
        tools: TOOL_SCHEMAS,
        signal,
      })) {
        if (delta.reasoning) {
          reasoning += delta.reasoning;
          yield { type: "thinking", text: delta.reasoning };
        }
        if (delta.content) {
          content += delta.content;
          yield { type: "content", text: delta.content };
        }
        if (delta.toolCalls) toolCalls = delta.toolCalls;
        if (delta.finishReason) finish = delta.finishReason;
        if (delta.usage) usage = delta.usage;
      }
    } catch (error) {
      yield {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      };
      return;
    }

    const assistant: ChatMessage = {
      role: "assistant",
      content: content || null,
      reasoning_content: reasoning || null,
      tool_calls: toolCalls,
    };
    messages.push(assistant);

    if (!toolCalls?.length || finish === "stop") {
      yield { type: "done", usage };
      return;
    }

    for (const call of toolCalls) {
      yield {
        type: "tool_start",
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      };
      const result = await executeTool(call.function.name, call.function.arguments);
      yield {
        type: "tool_result",
        id: call.id,
        name: call.function.name,
        ok: result.ok,
        output: result.output.slice(0, 24_000),
        changedFiles: result.changedFiles,
      };
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.output.slice(0, 24_000),
      });
    }
  }

  yield { type: "error", message: `Stopped after ${MAX_ROUNDS} tool rounds.` };
}
