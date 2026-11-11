import { object, type ConversationEvent } from "../core/index.js";
const text = (value: unknown) => (typeof value === "string" ? value : "");
const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
export function decodeClaudeActivity(message: Record<string, unknown>): ConversationEvent[] {
  if (message.parent_tool_use_id) return [];
  const events: ConversationEvent[] = [],
    body = object(message.message);
  if (message.type === "stream_event") {
    const event = object(message.event),
      block = object(event.content_block),
      delta = object(event.delta);
    if (event.type === "message_start")
      events.push({
        type: "message-start",
        id: `claude:${text(object(event.message).id) || crypto.randomUUID()}`,
      });
    if (event.type === "content_block_delta" && delta.type === "text_delta")
      events.push({ type: "message-delta", block: count(event.index), text: text(delta.text) });
    if (event.type === "message_stop") events.push({ type: "message-end" });
    if (event.type === "content_block_start" && block.type === "tool_use")
      events.push({ type: "tool", id: text(block.id), name: text(block.name), status: "running" });
  }
  if (message.type === "assistant" && Array.isArray(body.content)) {
    const content = body.content.map(object),
      value = content
        .filter((block) => block.type === "text")
        .map((block) => text(block.text))
        .join("\n");
    if (value)
      events.push({
        type: "message",
        ...(body.id ? { id: `claude:${text(body.id)}` } : {}),
        text: value,
        complete: true,
        unlessStreamed: true,
      });
    for (const block of content)
      if (block.type === "tool_use")
        events.push({
          type: "tool",
          id: text(block.id),
          name: text(block.name),
          status: "running",
        });
  }
  if (message.type === "user" && Array.isArray(body.content))
    for (const block of body.content.map(object))
      if (block.type === "tool_result")
        events.push({
          type: "tool-result",
          id: text(block.tool_use_id),
          failed: block.is_error === true,
        });
  if (message.type === "result") {
    if (text(message.result))
      events.push({
        type: "message",
        text: text(message.result),
        complete: true,
        unlessPresent: true,
      });
    const usage = object(message.usage),
      read = count(usage.cache_read_input_tokens),
      write = count(usage.cache_creation_input_tokens);
    if (Object.keys(usage).length)
      events.push({
        type: "usage",
        cumulative: false,
        known: true,
        durationMs: count(message.duration_ms),
        totals: {
          inputTokens: count(usage.input_tokens) + read + write,
          outputTokens: count(usage.output_tokens),
          cachedInputTokens: read,
          cacheWriteInputTokens: write,
        },
      });
  }
  return events;
}
