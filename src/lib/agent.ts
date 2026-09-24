import {
  addUsage,
  estimateCostUsd,
  streamChat,
  type ChatMessage,
  type TokenUsage,
  type ToolCall,
} from "./llm";
import { getProvider } from "./providers";
import { loadSettings } from "./settings";
import { clampMaxToolRounds } from "./tool-rounds";
import { buildSystemPrompt } from "./system-prompt";
import type { FileDiff } from "./diff";
import { executeTool, TOOL_SCHEMAS } from "./tools";

export type AgentEvent =
  | { type: "phase"; phase: "plan" | "inspect" | "change" | "validate" | "review" | "finish"; label: string }
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
      diff?: FileDiff;
    }
  | { type: "done"; usage?: TokenUsage }
  | { type: "error"; message: string };

/** Consecutive skip-only rounds before we tell the model it is looping. */
const STALL_NUDGE_AFTER = 2;
/** Consecutive skip-only rounds before we force a final answer (no tools). */
const STALL_STOP_AFTER = 3;
/** Tools that can change the workspace, so a later identical read/search is legitimate. */
const MUTATING_TOOLS = new Set(["write_file", "apply_diff", "run_terminal"]);
/** Live tool output kept in the in-flight messages array (and shown in UI). */
const MAX_TOOL_RESULT_CHARS = 6_000;
/**
 * After this many characters of tool output in the live transcript, older tool
 * results are compacted so each subsequent LLM round does not re-pay the full bill.
 */
const COMPACT_TOOL_BUDGET = 18_000;
/** Keep the N most recent tool results at full (capped) size; older ones get summarized. */
const KEEP_RECENT_TOOLS_FULL = 6;

type ToolCallRecord = { signature: string; name: string; ok: boolean };

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

  let usage: TokenUsage | undefined;
  const callHistory: ToolCallRecord[] = [];
  let skippedRounds = 0;
  let stallNudged = false;
  const maxRounds = clampMaxToolRounds(settings.maxToolRounds);

  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) return;

    const hitSafetyCap = round === maxRounds - 1;
    const phase =
      round === 0 ? { phase: "plan" as const, label: "Planning task" } :
      round === 1 ? { phase: "inspect" as const, label: "Inspecting workspace context" } :
      hitSafetyCap ? { phase: "finish" as const, label: "Preparing final result" } :
      { phase: "change" as const, label: "Applying changes and validating" };
    yield { type: "phase", ...phase };
    const forceFinish = hitSafetyCap || skippedRounds >= STALL_STOP_AFTER;
    if (forceFinish) {
      messages.push({
        role: "user",
        content: hitSafetyCap
          ? `[Dovee] Safety cap of ${maxRounds} tool rounds reached. Tools are disabled for this reply. Summarize what you finished, what is still incomplete, and the next step.`
          : "[Dovee] You are repeating tools that already ran. Tools are disabled for this reply. Summarize progress and the blocker instead of looping.",
      });
    } else if (skippedRounds >= STALL_NUDGE_AFTER && !stallNudged) {
      messages.push({
        role: "user",
        content:
          "[Dovee] Those last tool calls were repeats. Do not call the same tool with the same arguments again. Finish the task or describe the blocker.",
      });
      stallNudged = true;
    }

    // Shrink prior tool payloads before each paid call — this is the main cost lever.
    compactOldToolResults(messages);

    let reasoning = "";
    let content = "";
    let toolCalls: ToolCall[] | undefined;
    let finish: string | null | undefined;

    try {
      for await (const delta of streamChat({
        settings,
        messages,
        tools: forceFinish ? [] : TOOL_SCHEMAS,
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
        if (delta.usage) usage = addUsage(usage, delta.usage);
      }
    } catch (error) {
      yield {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      };
      return;
    }

    if (forceFinish && !content.trim()) {
      content = hitSafetyCap
        ? `Reached the ${maxRounds}-round safety cap. Send another message in this chat to continue, or open a new chat for new work.`
        : "Stopped because the same tools were repeating. Send another message to continue with a different approach.";
      yield { type: "content", text: content };
    }

    const assistant: ChatMessage = {
      role: "assistant",
      content: content || (toolCalls?.length && !forceFinish ? null : ""),
      tool_calls: !forceFinish && toolCalls?.length ? toolCalls : undefined,
    };
    if (reasoning) assistant.reasoning_content = reasoning;
    if (content || toolCalls?.length) messages.push(assistant);

    if (forceFinish || !toolCalls?.length || finish === "stop") {
      yield { type: "done", usage: finalizeUsage(settings.provider, usage) };
      return;
    }

    let executed = 0;
    for (const call of toolCalls) {
      yield {
        type: "tool_start",
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      };
      const signature = toolSignature(call.function.name, call.function.arguments);
      const skip = repeatSkipReason(callHistory, call.function.name, signature);
      const result = skip
        ? { ok: false, output: skip }
        : await executeTool(call.function.name, call.function.arguments);
      if (!skip) executed += 1;
      const output = clipToolOutput(result.output, MAX_TOOL_RESULT_CHARS);
      callHistory.push({ signature, name: call.function.name, ok: result.ok });
      yield {
        type: "tool_result",
        id: call.id,
        name: call.function.name,
        ok: result.ok,
        output,
        changedFiles: result.changedFiles,
        diff: result.diff,
      };
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: output,
      });
    }
    if (executed > 0) {
      skippedRounds = 0;
      stallNudged = false;
    } else {
      skippedRounds += 1;
    }
  }

  yield {
    type: "error",
    message: `Stopped after ${maxRounds} tool rounds. Send another message in this chat to continue.`,
  };
  if (usage) yield { type: "done", usage: finalizeUsage(settings.provider, usage) };
}

function toolSignature(name: string, rawArgs: string): string {
  return `${name}:${stableStringify(normalizeToolArgs(rawArgs))}`;
}

function normalizeToolArgs(raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = { ...(parsed as Record<string, unknown>) };
      for (const key of ["path", "cwd"] as const) {
        if (typeof obj[key] === "string") {
          obj[key] = obj[key].replace(/\\/g, "/").replace(/^\.\//, "");
        }
      }
      return obj;
    }
    return parsed;
  } catch {
    return raw.trim();
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}

function repeatSkipReason(
  history: ToolCallRecord[],
  name: string,
  signature: string,
): string | undefined {
  const same = history.filter((entry) => entry.signature === signature);
  if (same.length === 0) return undefined;

  const last = history.at(-1);
  if (last?.signature === signature) {
    return `Skipped: this exact ${name} call just ran. Do not repeat it. Use the previous result or change the arguments.`;
  }

  const lastIdx = history.findLastIndex((entry) => entry.signature === signature);
  const mutatedSince = history.slice(lastIdx + 1).some((entry) => MUTATING_TOOLS.has(entry.name));
  if (!mutatedSince) {
    return `Skipped: ${name} already ran with these arguments and nothing in the workspace has changed since. Do not loop — use the earlier output or try a different approach.`;
  }

  return undefined;
}

function clipToolOutput(text: string, max: number) {
  if (!text || text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head - 48;
  return `${text.slice(0, head)}\n\n… [${text.length - head - tail} chars omitted] …\n\n${text.slice(-Math.max(0, tail))}`;
}

/**
 * When the live tool transcript grows past COMPACT_TOOL_BUDGET, replace older
 * tool results with short stubs. Recent tools stay intact so the model can still
 * act on what it just read. Without this, tokens grow ~quadratically with rounds.
 */
function compactOldToolResults(messages: ChatMessage[]) {
  const toolIndexes: number[] = [];
  let total = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "tool") continue;
    toolIndexes.push(i);
    total += typeof m.content === "string" ? m.content.length : 0;
  }
  if (total <= COMPACT_TOOL_BUDGET || toolIndexes.length <= KEEP_RECENT_TOOLS_FULL) return;

  const keep = new Set(toolIndexes.slice(-KEEP_RECENT_TOOLS_FULL));
  for (const idx of toolIndexes) {
    if (keep.has(idx)) continue;
    const m = messages[idx];
    const text = typeof m.content === "string" ? m.content : "";
    if (text.length <= 240 || text.startsWith("[compacted]")) continue;
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 160);
    messages[idx] = {
      ...m,
      content: `[compacted] Earlier tool output omitted to save tokens (${text.length} chars). Preview: ${preview}${text.length > 160 ? "…" : ""}`,
    };
  }
}

function finalizeUsage(providerId: string, usage: TokenUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined;
  if (usage.cost_usd != null && Number.isFinite(usage.cost_usd)) {
    return { ...usage, estimated: usage.estimated ?? false };
  }
  const cost = estimateCostUsd(providerId, usage);
  if (cost == null) return usage;
  return { ...usage, cost_usd: cost, estimated: true };
}
