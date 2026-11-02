import { object, type ConversationSink, type ConversationEntry } from "@raypx/provider-core";
const text = (value: unknown) => (typeof value === "string" ? value : "");
const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
type Tool = Extract<ConversationEntry, { kind: "tool" }>;
export function recordClaudeActivity(sink: ConversationSink, message: Record<string, unknown>) {
  if (message.parent_tool_use_id) return;
  const body = object(message.message);
  if (message.type === "stream_event") {
    const event = object(message.event),
      block = object(event.content_block),
      delta = object(event.delta);
    if (event.type === "message_start") {
      sink.currentMessage = `claude:${text(object(event.message).id) || crypto.randomUUID()}`;
      sink.blockIndex = 0;
    }
    if (event.type === "content_block_delta" && delta.type === "text_delta") {
      sink.streamedMessages.add(sink.currentMessage);
      const index = count(event.index),
        previous = sink.entries.get(sink.currentMessage);
      sink.message(
        sink.currentMessage,
        (previous?.kind === "message" && previous.text && index !== sink.blockIndex ? "\n" : "") +
          text(delta.text),
        false,
        true,
      );
      sink.blockIndex = index;
    }
    if (event.type === "message_stop") {
      const entry = sink.entries.get(sink.currentMessage);
      if (entry?.kind === "message") sink.message(sink.currentMessage, entry.text, true);
    }
    if (event.type === "content_block_start" && block.type === "tool_use")
      sink.tool(text(block.id), text(block.name), "running");
  }
  if (message.type === "assistant" && Array.isArray(body.content)) {
    const key = body.id ? `claude:${text(body.id)}` : sink.currentMessage;
    const content = body.content.map(object);
    const value = content
      .filter((block) => block.type === "text")
      .map((block) => text(block.text))
      .join("\n");
    // With partial messages enabled, assistant records can repeat only one
    // content block. The streamed text already contains every preceding block.
    if (value && !sink.streamedMessages.has(key)) sink.message(key, value, true);
    for (const block of content)
      if (block.type === "tool_use") sink.tool(text(block.id), text(block.name), "running");
  }
  if (message.type === "user" && Array.isArray(body.content))
    for (const block of body.content.map(object))
      if (block.type === "tool_result") {
        const old = sink.entries.get(`tool:${text(block.tool_use_id)}`) as Tool | undefined;
        if (old)
          sink.tool(
            text(block.tool_use_id),
            old.name,
            block.is_error === true ? "failed" : "succeeded",
          );
      }
  if (message.type === "result") {
    if (text(message.result) && !sink.entries.has(sink.currentMessage))
      sink.message(sink.currentMessage, text(message.result), true);
    const usage = object(message.usage),
      read = count(usage.cache_read_input_tokens),
      write = count(usage.cache_creation_input_tokens);
    if (Object.keys(usage).length)
      sink.usage(
        count(usage.input_tokens) + read + write,
        count(usage.output_tokens),
        read,
        write,
        count(message.duration_ms),
      );
  }
}
