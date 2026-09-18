export type ChatUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cached_tokens?: number;
  cost_usd?: number;
  /** True when cost_usd came from a local rate-card estimate, not the provider bill. */
  estimated?: boolean;
};

export type AgentFileDiff = {
  path: string;
  original: string;
  modified: string;
  truncated?: boolean;
};

export type ToolCard = {
  id: string;
  name: string;
  arguments: string;
  output?: string;
  ok?: boolean;
  status: "running" | "done" | "error";
  /** Both sides of a write_file / apply_diff, for the visual diff viewer. */
  diff?: AgentFileDiff;
};

export type ChatAttachment = {
  id: string;
  name: string;
  mime: string;
  kind: "image" | "text";
  dataUrl?: string;
  text?: string;
};

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  tools: ToolCard[];
  usage?: ChatUsage;
  attachments?: ChatAttachment[];
};

export type AgentChat = {
  id: string;
  title: string;
  messages: ChatMsg[];
  streaming: boolean;
};
