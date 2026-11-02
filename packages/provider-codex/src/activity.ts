import { object, type ConversationEvent } from "@raypx/provider-core";
const text = (value: unknown) => (typeof value === "string" ? value : "");
const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
export function decodeCodexActivity(
  method: string,
  params: Record<string, unknown>,
): ConversationEvent[] {
  const events: ConversationEvent[] = [];
  if (method === "turn/started") events.push({ type: "turn", id: text(object(params.turn).id) });
  if (method === "item/agentMessage/delta")
    events.push({
      type: "message-delta",
      ...(params.itemId ? { id: `codex:${text(params.itemId)}` } : {}),
      text: text(params.delta),
    });
  if (method === "item/started" || method === "item/completed") {
    const item = object(params.item),
      id = text(item.id),
      kind = text(item.type);
    if (kind === "agentMessage")
      events.push({
        type: "message",
        ...(id ? { id: `codex:${id}` } : {}),
        text: text(item.text),
        complete: method === "item/completed",
      });
    const names: Record<string, string> = {
      commandExecution: "Shell",
      fileChange: "Edit",
      mcpToolCall: text(item.tool),
      dynamicToolCall: text(item.tool),
      webSearch: "WebSearch",
      imageView: "ViewImage",
      contextCompaction: "Compact",
    };
    if (Object.hasOwn(names, kind))
      events.push({
        type: "tool",
        id: id || kind,
        name: names[kind] || kind,
        status:
          method === "item/started"
            ? "running"
            : ["failed", "declined"].includes(text(item.status))
              ? "failed"
              : "succeeded",
      });
  }
  if (method === "thread/tokenUsage/updated") {
    const total = object(object(params.tokenUsage).total);
    events.push({
      type: "usage",
      cumulative: true,
      known: Object.keys(total).length > 0,
      ...(typeof params.turnId === "string" ? { turnId: params.turnId } : {}),
      totals: {
        inputTokens: count(total.inputTokens),
        outputTokens: count(total.outputTokens),
        cachedInputTokens: count(total.cachedInputTokens),
        cacheWriteInputTokens: count(total.cacheWriteInputTokens),
      },
    });
  }
  return events;
}
