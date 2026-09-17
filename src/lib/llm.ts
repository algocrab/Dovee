import { getProvider, type ProviderId } from "./providers";
import type { DoveeSettings } from "./settings";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" | "original" } };

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | ContentPart[] | null;
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

export type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** Prompt tokens served from cache (when the provider reports it). */
  cached_tokens?: number;
  /** Actual or estimated billed USD for this call / turn. */
  cost_usd?: number;
  /** True when cost_usd is from the local rate card, not the provider invoice. */
  estimated?: boolean;
};

export type StreamDelta = {
  reasoning?: string;
  content?: string;
  toolCalls?: ToolCall[];
  finishReason?: string | null;
  usage?: TokenUsage;
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

function hasMessageContent(content: ChatMessage["content"]) {
  if (content == null) return false;
  if (typeof content === "string") return content.length > 0;
  return Array.isArray(content) && content.length > 0;
}

function sanitizeOpenAiMessages(messages: ChatMessage[]): ChatMessage[] {
  const prepared: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") {
      prepared.push({ ...message, content: message.content ?? "" });
      continue;
    }
    const toolCalls = (message.tool_calls ?? []).filter((call) => call?.id && call.function?.name);
    // DeepSeek rejects assistant turns that have neither content nor tool_calls
    // (thinking-only / empty placeholders). Drop them instead of sending content: "".
    if (!hasMessageContent(message.content) && toolCalls.length === 0) {
      continue;
    }
    const next: ChatMessage = { role: "assistant" };
    if (message.reasoning_content) next.reasoning_content = message.reasoning_content;
    if (toolCalls.length) {
      next.tool_calls = toolCalls;
      next.content = hasMessageContent(message.content) ? message.content : null;
    } else {
      next.content = message.content;
    }
    prepared.push(next);
  }

  const validToolIds = new Set<string>();
  const out: ChatMessage[] = [];
  for (const message of prepared) {
    if (message.role === "assistant") {
      validToolIds.clear();
      for (const call of message.tool_calls ?? []) validToolIds.add(call.id);
      out.push(message);
      continue;
    }
    if (message.role === "tool") {
      if (message.tool_call_id && validToolIds.has(message.tool_call_id)) {
        out.push({ ...message, content: message.content ?? "" });
      }
      continue;
    }
    validToolIds.clear();
    out.push(message);
  }
  return out;
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
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          cost?: number;
          cost_in_usd?: number;
          cost_in_usd_ticks?: number;
          prompt_tokens_details?: { cached_tokens?: number };
          prompt_cache_hit_tokens?: number;
          cached_tokens?: number;
        };
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
      if (parsed.usage) out.usage = normalizeUsage(parsed.usage);
      if (out.reasoning || out.content || out.finishReason || out.usage || out.toolCalls) {
        yield out;
      }
    }
  }
}

function toAnthropicUserContent(content: ChatMessage["content"]) {
  if (!Array.isArray(content)) return content || "";
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    const url = part.image_url.url;
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(url);
    if (match) {
      return {
        type: "image",
        source: { type: "base64", media_type: match[1], data: match[2] },
      };
    }
    return { type: "image", source: { type: "url", url } };
  });
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
      out.push({ role: "user", content: toAnthropicUserContent(m.content) });
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

  const body: Record<string, unknown> = {
    model: options.settings.model,
    max_tokens: 16384,
    system,
    messages: toAnthropicMessages(options.messages),
    stream: true,
  };
  if (tools.length) body.tools = tools;

  const response = await fetch(`${options.settings.baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: extraHeaders("anthropic", options.settings.apiKey),
    body: JSON.stringify(body),
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


/** Normalize provider-specific usage payloads into a single shape. */
export function normalizeUsage(raw: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  cost_in_usd?: number;
  cost_in_usd_ticks?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  prompt_cache_hit_tokens?: number;
  cached_tokens?: number;
}): TokenUsage {
  const prompt = num(raw.prompt_tokens);
  const completion = num(raw.completion_tokens);
  const cached =
    num(raw.cached_tokens) ??
    num(raw.prompt_cache_hit_tokens) ??
    num(raw.prompt_tokens_details?.cached_tokens);
  const total = num(raw.total_tokens) ?? ((prompt ?? 0) + (completion ?? 0) || undefined);

  // xAI documents cost_in_usd_ticks as 1 tick = $1e-8. Prefer explicit USD fields first.
  const cost_usd =
    num(raw.cost_in_usd) ??
    num(raw.cost) ??
    (raw.cost_in_usd_ticks != null ? num(raw.cost_in_usd_ticks)! / 1e8 : undefined);

  const usage: TokenUsage = {};
  if (prompt != null) usage.prompt_tokens = prompt;
  if (completion != null) usage.completion_tokens = completion;
  if (total != null) usage.total_tokens = total;
  if (cached != null) usage.cached_tokens = cached;
  if (cost_usd != null && Number.isFinite(cost_usd)) usage.cost_usd = cost_usd;
  return usage;
}

export function addUsage(a?: TokenUsage, b?: TokenUsage): TokenUsage | undefined {
  if (!a && !b) return undefined;
  const out: TokenUsage = {
    prompt_tokens: (a?.prompt_tokens ?? 0) + (b?.prompt_tokens ?? 0),
    completion_tokens: (a?.completion_tokens ?? 0) + (b?.completion_tokens ?? 0),
    total_tokens: (a?.total_tokens ?? 0) + (b?.total_tokens ?? 0),
    cached_tokens: (a?.cached_tokens ?? 0) + (b?.cached_tokens ?? 0),
  };
  const cost = (a?.cost_usd ?? 0) + (b?.cost_usd ?? 0);
  if (cost > 0) out.cost_usd = cost;
  if (!out.prompt_tokens && !out.completion_tokens && !out.total_tokens) return a ?? b;
  return out;
}

/** Rough USD estimate when the provider does not return a billed cost. */
export function estimateCostUsd(
  providerId: string,
  usage: TokenUsage | undefined,
): number | undefined {
  if (!usage) return undefined;
  if (usage.cost_usd != null && Number.isFinite(usage.cost_usd)) return usage.cost_usd;
  const prompt = usage.prompt_tokens ?? 0;
  const completion = usage.completion_tokens ?? 0;
  const cached = Math.min(usage.cached_tokens ?? 0, prompt);
  const fresh = Math.max(0, prompt - cached);
  // $/1M tokens — close enough for a status-bar meter, not an invoice.
  const rates: Record<string, { in: number; out: number; cache: number }> = {
    xai: { in: 2, out: 6, cache: 0.5 },
    openai: { in: 2.5, out: 10, cache: 1.25 },
    deepseek: { in: 0.27, out: 1.1, cache: 0.07 },
    anthropic: { in: 3, out: 15, cache: 0.3 },
    google: { in: 1.25, out: 5, cache: 0.315 },
    groq: { in: 0.59, out: 0.79, cache: 0.59 },
    openrouter: { in: 2, out: 6, cache: 0.5 },
    mistral: { in: 2, out: 6, cache: 0.5 },
    together: { in: 0.88, out: 0.88, cache: 0.88 },
  };
  const rate = rates[providerId] ?? { in: 2, out: 6, cache: 0.5 };
  const usd = (fresh * rate.in + cached * rate.cache + completion * rate.out) / 1_000_000;
  return usd > 0 ? usd : undefined;
}

export function formatUsage(usage: TokenUsage | undefined, opts?: { estimated?: boolean }): string {
  if (!usage) return "";
  const total = usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  if (!total && usage.cost_usd == null) return "";
  const parts: string[] = [];
  if (total) {
    parts.push(total >= 1000 ? `${(total / 1000).toFixed(total >= 10_000 ? 0 : 1)}k tok` : `${total} tok`);
  }
  if (usage.cost_usd != null && usage.cost_usd > 0) {
    const prefix = opts?.estimated ? "~$" : "$";
    parts.push(
      usage.cost_usd < 0.01
        ? `${prefix}${usage.cost_usd.toFixed(4)}`
        : `${prefix}${usage.cost_usd.toFixed(3)}`,
    );
  }
  return parts.join(" · ");
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
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
  const sanitized = sanitizeOpenAiMessages(options.messages);
  const messages =
    provider.id === "deepseek"
      ? sanitized
      : sanitized.map((m) => {
          const copy = { ...m };
          delete copy.reasoning_content;
          return copy;
        });

  const body: Record<string, unknown> = {
    model: options.settings.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
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
