import type { TaskActivity } from "@raypx/core/tasks";
export type ConversationEntry = TaskActivity extends infer T
  ? T extends TaskActivity
    ? Omit<T, "order" | "revision">
    : never
  : never;
export type TokenTotals = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
};
export interface ConversationSink {
  readonly entries: Map<string, ConversationEntry>;
  readonly streamedMessages: Set<string>;
  turn: number;
  currentMessage: string;
  totals: TokenTotals | undefined;
  turnUsage: TokenTotals;
  usageKnown: boolean;
  codexTurn: string;
  blockIndex: number;
  persistTotals?: ((value: TokenTotals) => void) | undefined;
  message(key: string, value: string, complete: boolean, append?: boolean): void;
  tool(id: string, name: string, status: Extract<TaskActivity, { kind: "tool" }>["status"]): void;
  usage(
    input: number,
    output: number,
    cached: number,
    cacheWrite?: number,
    duration?: number,
    known?: boolean,
  ): void;
}
