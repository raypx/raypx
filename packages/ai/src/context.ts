import type { Api, Context, Message, Model, Tool } from "@earendil-works/pi-ai";
import { transformMessages } from "@earendil-works/pi-ai/api/transform-messages";
import { estimateContextTokens, estimateTextTokens } from "@earendil-works/pi-ai/utils/estimate";

/** Keep canonical history intact. Reject lossy attachment conversion before invoking an API. */
export function prepareModelContext(
  messages: Message[],
  model: Model<Api>,
  tools: Tool[] = [],
): Context {
  if (
    !model.input.includes("image") &&
    messages.some(
      (message) =>
        Array.isArray(message.content) && message.content.some((part) => part.type === "image"),
    )
  )
    throw new Error("AI_CONTEXT_INCOMPATIBLE");
  const converted = transformMessages(structuredClone(messages), model);
  const estimated =
    estimateContextTokens(converted).tokens + estimateTextTokens(JSON.stringify(tools));
  if (estimated + Math.min(model.maxTokens, 4096) > model.contextWindow)
    throw new Error("AI_CONTEXT_TOO_LARGE");
  return { messages: converted, tools };
}
