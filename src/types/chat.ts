export type ToolCard = {
  id: string;
  name: string;
  arguments: string;
  output?: string;
  ok?: boolean;
  status: "running" | "done" | "error";
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
  attachments?: ChatAttachment[];
};

export type AgentChat = {
  id: string;
  title: string;
  messages: ChatMsg[];
  streaming: boolean;
};
