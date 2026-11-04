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
export type ConversationEvent =
  | { type: "turn"; id: string }
  | { type: "message-start"; id: string }
  | { type: "message-delta"; id?: string; text: string; block?: number }
  | { type: "message-end" }
  | {
      type: "message";
      id?: string;
      text: string;
      complete: boolean;
      unlessStreamed?: boolean;
      unlessPresent?: boolean;
    }
  | { type: "tool"; id: string; name: string; status: "running" | "succeeded" | "failed" }
  | { type: "tool-result"; id: string; failed: boolean }
  | {
      type: "usage";
      totals: TokenTotals;
      cumulative: boolean;
      turnId?: string;
      known: boolean;
      durationMs?: number;
    };
