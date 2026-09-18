export type DebugStatus = "idle" | "starting" | "running" | "paused" | "stopped";

export type Breakpoint = {
  id: string;
  path: string;
  line: number;
  enabled: boolean;
};

export type DebugFrame = {
  id: string;
  functionName: string;
  path: string;
  line: number;
  column: number;
  inWorkspace: boolean;
};

export type DebugVar = {
  name: string;
  value: string;
  type?: string;
};

export type DebugPaused = {
  path: string;
  line: number;
  column: number;
  reason: string;
};

export type DebugSnapshot = {
  status: DebugStatus;
  frames: DebugFrame[];
  vars: DebugVar[];
  output: string;
  paused: DebugPaused | null;
  error?: string;
};

export type DebugEvent =
  | ({ type: "snapshot" } & DebugSnapshot)
  | { type: "status"; status: DebugStatus; message?: string }
  | { type: "paused"; paused: DebugPaused; frames: DebugFrame[]; vars: DebugVar[] }
  | { type: "resumed" }
  | { type: "variables"; vars: DebugVar[] }
  | { type: "output"; text: string; stream: "stdout" | "stderr" | "console" }
  | { type: "error"; message: string }
  | { type: "stopped"; code: number | null };
