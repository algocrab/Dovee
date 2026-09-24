import { getProvider } from "./providers";
import type { DoveeSettings } from "./settings";

export type CompletionRequest = {
  prefix: string;
  suffix: string;
  language: string;
  filePath: string;
  nearbyCode?: string;
};

export type CompletionResult = {
  ok: boolean;
  completion?: string;
  error?: string;
};

function endpoint(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

function headers(provider: string, apiKey: string): Record<string, string> {
  if (provider === "anthropic") {
    return {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

function cleanCompletion(value: string) {
  return value
    .replace(/^```[\w+-]*\r?\n/, "")
    .replace(/\r?\n```$/, "")
    .replace(/<\|(?:eot_id|end_of_text|end)\|>/g, "")
    .trimEnd();
}

export async function requestCompletion(
  settings: DoveeSettings,
  input: CompletionRequest,
  signal?: AbortSignal,
): Promise<CompletionResult> {
  if (!settings.apiKey) return { ok: false, error: "No API key configured" };
  const provider = getProvider(settings.provider);
  const model = settings.completionModel || settings.model;
  const context = [
    `Complete the ${input.language} code at the cursor. Return only the code to insert.`,
    "Do not repeat code that is already present. Do not include markdown fences or explanations.",
    `File: ${input.filePath}`,
    `Prefix:\n${input.prefix.slice(-6000)}`,
    `Suffix:\n${input.suffix.slice(0, 3000)}`,
    input.nearbyCode ? `Nearby symbols:\n${input.nearbyCode.slice(0, 4000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const body =
    provider.format === "anthropic"
      ? {
          model,
          max_tokens: 256,
          temperature: 0,
          messages: [{ role: "user", content: context }],
        }
      : {
          model,
          max_tokens: 256,
          temperature: 0,
          stream: false,
          messages: [
            { role: "system", content: "You are a precise inline code completion engine." },
            { role: "user", content: context },
          ],
        };

  try {
    const response = await fetch(
      provider.format === "anthropic" ? settings.baseUrl.replace(/\/$/, "") + "/v1/messages" : endpoint(settings.baseUrl),
      {
        method: "POST",
        headers: headers(settings.provider, settings.apiKey),
        body: JSON.stringify(body),
        signal,
      },
    );
    if (!response.ok) {
      return { ok: false, error: `${provider.label} API ${response.status}` };
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      content?: Array<{ text?: string }>;
    };
    const completion = cleanCompletion(
      data.choices?.[0]?.message?.content ?? data.content?.map((part) => part.text ?? "").join("") ?? "",
    );
    return completion ? { ok: true, completion } : { ok: false, error: "Provider returned an empty completion" };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { ok: false, error: "cancelled" };
    return { ok: false, error: error instanceof Error ? error.message : "Completion request failed" };
  }
}
