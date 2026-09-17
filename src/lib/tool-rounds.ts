export const DEFAULT_MAX_TOOL_ROUNDS = 120;
export const MIN_TOOL_ROUNDS = 16;
export const MAX_TOOL_ROUNDS_LIMIT = 500;

export function clampMaxToolRounds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_TOOL_ROUNDS;
  return Math.min(MAX_TOOL_ROUNDS_LIMIT, Math.max(MIN_TOOL_ROUNDS, Math.round(value)));
}
