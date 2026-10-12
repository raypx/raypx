import { eventIterator, oc } from "@orpc/contract";
import { z } from "zod";

/** Private execution protocol. Never compose this tree into the public API. */
export const executionOperations = [
  "workerControl",
  "workerAssets",
  "startExecution",
  "appendEvent",
  "createWorkerAsset",
  "completeWorkerAsset",
  "finishExecution",
  "finish",
  "finishWithRevision",
  "interrupt",
  "acknowledgeCommand",
] as const;
const id = z.string().min(1).max(200);
const text = z.string().max(200_000);
const empty = z.object({}).strict();
const eventPayloads = {
  "message.delta": z.object({ messageId: id, text }),
  "message.completed": z.object({ messageId: id, text }),
  "tool.started": z.object({ callId: id, name: id, input: z.unknown() }),
  "tool.completed": z.object({
    callId: id,
    name: id,
    output: z.unknown(),
    isError: z.boolean().optional(),
  }),
  "source.created": z.object({
    id,
    url: z.url().max(4096),
    title: z.string().max(1000),
    excerpt: z.string().max(100_000),
  }),
};
export const executionPayloadSchemas = {
  workerControl: empty,
  workerAssets: empty,
  interrupt: empty,
  startExecution: z.object({ role: id, prompt: text, parentId: id.optional() }).strict(),
  appendEvent: z
    .object({
      eventId: id,
      executionId: id.optional(),
      type: z.enum([
        "message.delta",
        "message.completed",
        "tool.started",
        "tool.completed",
        "source.created",
      ]),
      payload: z
        .record(z.string(), z.unknown())
        .refine((value) => JSON.stringify(value).length <= 256_000),
    })
    .strict()
    .superRefine((event, context) => {
      if (!eventPayloads[event.type].safeParse(event.payload).success)
        context.addIssue({ code: "custom", message: "Invalid execution event payload" });
    }),
  createWorkerAsset: z
    .object({
      name: z.string().min(1).max(255),
      mediaType: z.string().min(1).max(200),
      byteSize: z
        .number()
        .int()
        .positive()
        .max(10 * 1024 * 1024),
      checksum: z.string().regex(/^[a-f0-9]{64}$/),
      idempotencyKey: id,
    })
    .strict(),
  completeWorkerAsset: z
    .object({
      assetVersionId: id,
      byteSize: z.number().int().nonnegative(),
      checksum: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  finishExecution: z
    .object({
      executionId: id,
      status: z.enum(["succeeded", "failed", "cancelled"]),
      output: text.optional(),
    })
    .strict(),
  finish: z
    .object({
      status: z.enum(["succeeded", "failed", "needs_input", "cancelled"]),
      output: text.optional(),
      error: z.string().max(200).optional(),
    })
    .strict(),
  finishWithRevision: z
    .object({ assetVersionIds: z.array(id).min(1).max(100), summary: text, output: text })
    .strict(),
  acknowledgeCommand: z.object({ commandId: id, status: z.enum(["applied", "rejected"]) }).strict(),
};
const invoke = oc
  .input(
    z.object({
      operation: z.enum(executionOperations),
      payload: z.record(z.string(), z.unknown()),
    }),
  )
  .output(z.unknown());
const model = oc
  .input(
    z.object({
      executionId: z.string().min(1).max(200),
      callId: z.string().uuid(),
      context: z.unknown(),
      maxOutputTokens: z.number().int().positive().max(8192),
    }),
  )
  .output(eventIterator(z.unknown()));
const research = oc
  .input(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("search"), query: z.string().min(1).max(2000) }),
      z.object({ type: z.literal("read"), url: z.url().max(4096) }),
    ]),
  )
  .output(z.unknown());
const object = oc
  .input(
    z.object({
      operation: z.enum(["put", "head", "read"]),
      key: z.string().min(1).max(1000),
      bytes: z.string().max(14_000_000).optional(),
    }),
  )
  .output(z.unknown());
const bootstrap = oc.input(z.object({})).output(z.unknown());
export const executionGatewayContract = { bootstrap, invoke, model, research, object };
