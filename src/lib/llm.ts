import { getProvider, type ProviderId } from "./providers";
import type { DoveeSettings } from "./settings";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  reasoning_content?: string | null;
  tool_calls?: ToolCall[];
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type StreamDelta = {
  reasoning?: string;
  content?: string;
  toolCalls?: ToolCall[];
  finishReason?: string | null;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type AccumTool = { id: string; name: string; arguments: string };

type OpenAiTool = {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
};

function chatUrl(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

function extraHeaders(provider: ProviderId, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    return headers;
  }
  headers.Authorization = `Bearer ${apiKey}`;
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://dovee.local";
    headers["X-Title"] = "Dovee IDE";
  }
  return headers;
}

async function* parseOpenAiStream(response: Response): AsyncGenerator<StreamDelta> {
  if (!response.body) throw new Error("Empty stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const tools = new Map<number, AccumTool>();

  const flushTools = (): ToolCall[] | undefined => {
    if (tools.size === 0) return undefined;
    return [...tools.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, t]) => ({
        id: t.id,
        type: "function" as const,
        function: { name: t.name, arguments: t.arguments },
      }));
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      if (data === "[DONE]") {
        const toolCalls = flushTools();
        if (toolCalls) yield { toolCalls };
        return;
      }

      let parsed: {
        usage?: StreamDelta["usage"];
        choices?: Array<{
          finish_reason?: string | null;
          delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            reasoning?: string | null;
            tool_calls?: Array<{
              index: number;
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      };
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      const choice = parsed.choices?.[0];
      const delta = choice?.delta;
      if (delta?.tool_calls) {
        for (const call of delta.tool_calls) {
          const existing = tools.get(call.index) ?? { id: "", name: "", arguments: "" };
          if (call.id) existing.id = call.id;
          if (call.function?.name) existing.name = call.function.name;
          if (call.function?.arguments) existing.arguments += call.function.arguments;
          tools.set(call.index, existing);
        }
      }

      const out: StreamDelta = {};
      if (delta?.reasoning_content) out.reasoning = delta.reasoning_content;
      else if (delta?.reasoning) out.reasoning = delta.reasoning;
      if (delta?.content) out.content = delta.content;
      if (choice?.finish_reason) {
        out.finishReason = choice.finish_reason;
        out.toolCalls = flushTools();
      }
      if (parsed.usage) out.usage = parsed.usage;
      if (out.reasoning || out.content || out.finishReason || out.usage || out.toolCalls) {
        yield out;
      }
    }
  }
}

function toAnthropicMessages(messages: ChatMessage[]) {
  const out: Array<{ role: string; content: unknown }> = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (m.role === "system") {
      i += 1;
      continue;
    }
    if (m.role === "user") {
      out.push({ role: "user", content: m.content || "" });
      i += 1;
      continue;
    }
    if (m.role === "assistant") {
      const content: unknown[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const t of m.tool_calls ?? []) {
        let input: unknown = {};
        try {
          input = JSON.parse(t.function.arguments || "{}");
        } catch {
          input = {};
        }
        content.push({ type: "tool_use", id: t.id, name: t.function.name, input });
      }
      out.push({ role: "assistant", content: content.length ? content : m.content || "" });
      i += 1;
      continue;
    }
    if (m.role === "tool") {
      const results: unknown[] = [];
      while (i < messages.length && messages[i].role === "tool") {
        results.push({
          type: "tool_result",
          tool_use_id: messages[i].tool_call_id,
          content: messages[i].content || "",
        });
        i += 1;
      }
      out.push({ role: "user", content: results });
      continue;
    }
    i += 1;
  }
  return out;
}

async function* streamAnthropic(options: {
  settings: DoveeSettings;
  messages: ChatMessage[];
  tools: OpenAiTool[];
  signal?: AbortSignal;
}): AsyncGenerator<StreamDelta> {
  const system = options.messages.find((m) => m.role === "system")?.content || "";
  const tools = options.tools.map((t) => ({
    name: t.function.name,
    description: t.function.description || "",
    input_schema: t.function.parameters || { type: "object", properties: {} },
  }));

  const response = await fetch(`${options.settings.baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: extraHeaders("anthropic", options.settings.apiKey),
    body: JSON.stringify({
      model: options.settings.model,
      max_tokens: 16384,
      system,
      messages: toAnthropicMessages(options.messages),
      tools,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 800) || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const toolMap = new Map<number, AccumTool>();
  let blockIndex = -1;
  let blockType = "";

  const flush = (): ToolCall[] | undefined => {
    if (toolMap.size === 0) return undefined;
    return [...toolMap.values()].map((t) => ({
      id: t.id,
      type: "function" as const,
      function: { name: t.name, arguments: t.arguments },
    }));
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const event = /event:\s*(\S+)/.exec(chunk)?.[1];
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!event || !dataLine) continue;
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (event === "content_block_start") {
        blockIndex = Number(data.index ?? 0);
        const block = data.content_block as { type?: string; id?: string; name?: string } | undefined;
        blockType = block?.type ?? "";
        if (blockType === "tool_use" && block?.id && block.name) {
          toolMap.set(blockIndex, { id: block.id, name: block.name, arguments: "" });
        }
      }
      if (event === "content_block_delta") {
        const delta = data.delta as { type?: string; text?: string; partial_json?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) yield { content: delta.text };
        if (delta?.type === "thinking_delta" && delta.text) yield { reasoning: delta.text };
        if (delta?.type === "input_json_delta" && delta.partial_json) {
          const existing = toolMap.get(blockIndex);
          if (existing) existing.arguments += delta.partial_json;
        }
      }
      if (event === "message_delta") {
        const delta = data.delta as { stop_reason?: string } | undefined;
        const reason = delta?.stop_reason;
        if (reason === "tool_use") yield { finishReason: "tool_calls", toolCalls: flush() };
        else if (reason) yield { finishReason: "stop", toolCalls: flush() };
      }
    }
  }
}

export async function* streamChat(options: {
  settings: DoveeSettings;
  messages: ChatMessage[];
  tools: unknown[];
  signal?: AbortSignal;
}): AsyncGenerator<StreamDelta> {
  const provider = getProvider(options.settings.provider);
  const tools = options.tools as OpenAiTool[];

  if (provider.format === "anthropic") {
    yield* streamAnthropic({ ...options, tools });
    return;
  }

  const thinkingEnabled = provider.id === "deepseek" && options.settings.reasoningEffort !== "none";
  const messages =
    provider.id === "deepseek"
      ? options.messages
      : options.messages.map((m) => {
          const copy = { ...m };
          delete copy.reasoning_content;
          return copy;
        });

  const body: Record<string, unknown> = {
    model: options.settings.model,
    messages,
    tools,
    tool_choice: "auto",
    stream: true,
    stream_options: { include_usage: true },
  };
  if (provider.id === "deepseek") {
    body.thinking = { type: thinkingEnabled ? "enabled" : "disabled" };
    if (thinkingEnabled) body.reasoning_effort = options.settings.reasoningEffort;
  }

  const response = await fetch(chatUrl(options.settings.baseUrl), {
    method: "POST",
    headers: extraHeaders(provider.id, options.settings.apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => "");
    throw new Error(`${provider.label} API ${response.status}: ${errText.slice(0, 800) || response.statusText}`);
  }

  yield* parseOpenAiStream(response);
}
