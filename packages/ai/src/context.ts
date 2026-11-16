import type { Api, Context, Message, Model, Tool } from "@earendil-works/pi-ai";
import { clampMaxTokensToContext } from "@earendil-works/pi-ai/api/simple-options";
import { transformMessages } from "@earendil-works/pi-ai/api/transform-messages";
import {
  estimateContextTokens,
  estimateMessageTokens,
  estimateTextTokens,
} from "@earendil-works/pi-ai/utils/estimate";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";

/** Reuse the transport's empty-context allowance to account for its safety margin. */
export function modelInputTokenBudget(model: Model<Api>, outputTokens: number): number {
  const available = clampMaxTokensToContext(
    model,
    normalizeContext({ messages: [] }),
    model.contextWindow,
  );
  return Math.max(0, available - outputTokens);
}

/** Estimate this exact request without reusing usage from a different history prefix. */
export function estimateModelInputTokens(context: Context): number {
  return (
    context.messages.reduce((total, message) => total + 4 + estimateMessageTokens(message), 0) +
    estimateTextTokens(context.systemPrompt ?? "") +
    (context.tools?.length ? estimateTextTokens(JSON.stringify(context.tools)) : 0)
  );
}

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
