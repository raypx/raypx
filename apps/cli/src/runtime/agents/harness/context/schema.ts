import { z } from "zod";

const id = z.string().min(1);
const count = z.number().finite().nonnegative();
const object = z.record(z.string(), z.json());
const text = z.strictObject({
  type: z.literal("text"),
  text: z.string(),
  textSignature: z.string().optional(),
});
const image = z.strictObject({ type: z.literal("image"), data: z.string(), mimeType: id });
const thinking = z.strictObject({
  type: z.literal("thinking"),
  thinking: z.string(),
  thinkingSignature: z.string().optional(),
  redacted: z.boolean().optional(),
});
const toolCall = z.strictObject({
  type: z.literal("toolCall"),
  id,
  name: id,
  arguments: object,
  thoughtSignature: z.string().optional(),
  namespace: z.string().optional(),
  argumentsError: z.string().optional(),
});
const usage = z.strictObject({
  input: count,
  output: count,
  cacheRead: count,
  cacheWrite: count,
  cacheWrite1h: count.optional(),
  reasoning: count.optional(),
  totalTokens: count,
  cost: z.strictObject({
    input: count,
    output: count,
    cacheRead: count,
    cacheWrite: count,
    total: count,
  }),
});
const tool = z.strictObject({
  name: id,
  description: z.string(),
  parameters: object,
  constrainedSampling: z
    .union([
      z.literal(false),
      z.strictObject({ type: z.literal("json_schema"), strict: z.enum(["prefer", "require"]) }),
      z.strictObject({
        type: z.literal("grammar"),
        variants: z.strictObject({
          openai_lark: z.string().optional(),
          openai_regex: z.string().optional(),
        }),
      }),
    ])
    .optional(),
});
const message = z.discriminatedUnion("role", [
  z.strictObject({
    role: z.literal("system"),
    content: z.union([z.string(), z.array(text)]),
    timestamp: count,
    sections: z.record(z.string(), z.string().nullable()).optional(),
    toolsAdded: z.array(tool).optional(),
    toolsRemoved: z.array(z.strictObject({ name: id })).optional(),
  }),
  z.strictObject({
    role: z.literal("user"),
    content: z.union([z.string(), z.array(z.union([text, image]))]),
    timestamp: count,
  }),
  z.strictObject({
    role: z.literal("assistant"),
    content: z.array(z.union([text, thinking, toolCall])),
    api: id,
    provider: id,
    model: id,
    usage,
    stopReason: z.enum(["pending", "stop", "length", "toolUse", "error", "aborted", "deferred"]),
    timestamp: count,
    durationMs: count.optional(),
    responseModel: z.string().optional(),
    responseId: z.string().optional(),
    providerThinkingLevel: z.string().optional(),
    thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
    diagnostics: z
      .array(
        z.strictObject({
          type: id,
          timestamp: count,
          details: object.optional(),
          error: z
            .strictObject({
              name: z.string().optional(),
              message: z.string(),
              stack: z.string().optional(),
              code: z.union([z.string(), z.number().finite()]).optional(),
            })
            .optional(),
        }),
      )
      .optional(),
    deferred: z
      .strictObject({
        provider: id,
        modelId: id,
        api: id,
        id,
        expiresAt: count.optional(),
        pollAfterMs: count.optional(),
        data: z.json().optional(),
      })
      .optional(),
    errorMessage: z.string().optional(),
    rawStopReason: z.string().optional(),
    endTurn: z.boolean().optional(),
  }),
  z.strictObject({
    role: z.literal("toolResult"),
    toolCallId: id,
    toolName: id,
    content: z.array(z.union([text, image])),
    details: z.json().optional(),
    usage: usage.optional(),
    nestedCalls: z
      .strictObject({
        calls: z.array(
          z.strictObject({
            id,
            name: id,
            arguments: object.optional(),
            argumentsBytes: count.int().optional(),
            status: z.enum(["ok", "error", "unfinished"]),
            durationMs: count.optional(),
            error: z.string().optional(),
          }),
        ),
        complete: z.boolean(),
      })
      .optional(),
    isError: z.boolean(),
    timestamp: count,
    durationMs: count.optional(),
  }),
]);

/** Pinned SDK transcript JSON, without live TypeBox symbols or provider objects. */
export const piStoredContextSchema = z.strictObject({
  status: z.enum(["idle", "running", "succeeded", "failed", "cancelled", "uncertain"]),
  messages: z.array(message),
  pendingEffect: z.strictObject({ id, name: id }).optional(),
});
