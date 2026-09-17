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

type AccumTool = {
  id: string;
  name: string;
  arguments: string;
};

export async function* streamDeepSeek(options: {
  settings: DoveeSettings;
  messages: ChatMessage[];
  tools: unknown[];
  signal?: AbortSignal;
}): AsyncGenerator<StreamDelta> {
  const thinkingEnabled = options.settings.reasoningEffort !== "none";
  const body: Record<string, unknown> = {
    model: options.settings.model,
    messages: options.messages,
    tools: options.tools,
    tool_choice: "auto",
    stream: true,
    stream_options: { include_usage: true },
    thinking: { type: thinkingEnabled ? "enabled" : "disabled" },
  };
  if (thinkingEnabled) {
    body.reasoning_effort = options.settings.reasoningEffort;
  }

  const response = await fetch(`${options.settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.settings.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => "");
    throw new Error(`DeepSeek API ${response.status}: ${errText.slice(0, 800) || response.statusText}`);
  }

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
