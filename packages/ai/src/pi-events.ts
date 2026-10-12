import type { AiRunEvent } from "./index.js";
import { normalizeModelUsage } from "./cloud-pi.js";

export type AssistantResult = Extract<AiRunEvent, { type: "message_completed" }> & {
  errorMessage?: string;
};
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;

export function normalizePiEvent(event: unknown): AiRunEvent | null {
  const value = record(event);
  if (!value) return null;
  if (value.type === "message_update") {
    const update = record(value.assistantMessageEvent);
    if (update?.type === "text_delta" && typeof update.delta === "string")
      return { type: "text_delta", text: update.delta };
    if (update?.type === "thinking_start") return { type: "thinking", active: true };
    if (update?.type === "thinking_end") return { type: "thinking", active: false };
  }
  if (value.type === "message_end") {
    const message = record(value.message);
    if (message?.role !== "assistant") return null;
    const content = Array.isArray(message.content) ? message.content : [];
    const text =
      typeof message.content === "string"
        ? message.content
        : content
            .map((block) => {
              const entry = record(block);
              return entry?.type === "text" && typeof entry.text === "string" ? entry.text : "";
            })
            .join("");
    return {
      type: "message_completed",
      text,
      stopReason: typeof message.stopReason === "string" ? message.stopReason : "unknown",
      ...(message.usage ? { usage: normalizeModelUsage(message.usage) } : {}),
    };
  }
  if (value.type === "tool_execution_start" && typeof value.toolName === "string")
    return {
      type: "tool_call",
      callId: typeof value.toolCallId === "string" ? value.toolCallId : "unknown",
      name: value.toolName,
      input: value.args ?? {},
    };
  if (value.type === "tool_execution_end" && typeof value.toolName === "string")
    return {
      type: "tool_result",
      callId: typeof value.toolCallId === "string" ? value.toolCallId : "unknown",
      name: value.toolName,
      output: value.result ?? null,
      ...(value.isError === true ? { isError: true } : {}),
    };
  return null;
}

export function settledResult(message: AssistantResult | undefined): AiRunEvent {
  if (message?.stopReason === "aborted") return { type: "cancelled" };
  if (!message || !["stop", "length"].includes(message.stopReason))
    return {
      type: "failed",
      message: message?.errorMessage ?? "Pi did not produce a successful settled response.",
    };
  return { type: "completed", text: message.text };
}
