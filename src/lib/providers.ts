export type ProviderId =
  | "deepseek"
  | "openai"
  | "xai"
  | "anthropic"
  | "google"
  | "groq"
  | "openrouter"
  | "mistral"
  | "together"
  | "custom";

export type Provider = {
  id: ProviderId;
  label: string;
  baseUrl: string;
  models: string[];
  docs: string;
  format: "openai" | "anthropic";
};

export const PROVIDERS: Provider[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: ["deepseek-flash", "deepseek-v4-pro"],
    docs: "https://platform.deepseek.com",
    format: "openai",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "o3", "o4-mini"],
    docs: "https://platform.openai.com/api-keys",
    format: "openai",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    models: ["grok-4.5", "grok-4", "grok-3", "grok-3-mini"],
    docs: "https://console.x.ai",
    format: "openai",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com",
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
    docs: "https://console.anthropic.com",
    format: "anthropic",
  },
  {
    id: "google",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
    docs: "https://aistudio.google.com/apikey",
    format: "openai",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b"],
    docs: "https://console.groq.com/keys",
    format: "openai",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      "openai/gpt-4.1",
      "anthropic/claude-sonnet-4.5",
      "google/gemini-2.5-pro",
      "deepseek/deepseek-chat",
      "x-ai/grok-4",
    ],
    docs: "https://openrouter.ai/keys",
    format: "openai",
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    models: ["mistral-large-latest", "codestral-latest", "mistral-small-latest"],
    docs: "https://console.mistral.ai",
    format: "openai",
  },
  {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-Coder-32B-Instruct"],
    docs: "https://api.together.xyz",
    format: "openai",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    baseUrl: "https://api.example.com/v1",
    models: [],
    docs: "",
    format: "openai",
  },
];

export function getProvider(id: string | undefined): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}
