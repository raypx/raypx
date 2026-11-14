import { z } from "zod";
import { spaceIdSchema } from "./spaces.js";
import { conversationIdSchema } from "./agents.js";
import { runIdSchema } from "./conversation.js";

/** A destination is data, never permission. No value belongs in this schema. */
export const protectedInputSpecSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  purpose: z.string().trim().min(1).max(256),
  destination: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("environment"),
      variable: z.string().regex(/^[A-Z_][A-Z0-9_]{0,63}$/),
    }),
    z.strictObject({ kind: z.literal("http-bearer") }),
  ]),
});
export type ProtectedInputSpec = z.infer<typeof protectedInputSpecSchema>;
export const protectedInputRequestSchema = z.strictObject({
  id: z.string().uuid(),
  spaceId: spaceIdSchema,
  conversationId: conversationIdSchema,
  runId: runIdSchema,
  memberAccountId: z.string().min(1),
  toolCallId: z.string().min(1).max(128),
  toolName: z.string().min(1).max(128),
  target: z.string().max(1024),
  input: protectedInputSpecSchema,
  untrustedInput: z.boolean(),
  provenanceKind: z.string().max(32).nullable(),
  state: z.enum(["pending", "answered", "declined", "expired", "consumed", "cancelled"]),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type ProtectedInputRequest = z.infer<typeof protectedInputRequestSchema>;
/** Input-only; never include this in a cache, event, checkpoint or error. */
export const protectedInputAnswerSchema = z.discriminatedUnion("decision", [
  z.strictObject({
    decision: z.literal("answer"),
    value: z
      .string()
      .min(1)
      .max(4096)
      .refine((s) => !s.includes("\0")),
  }),
  z.strictObject({ decision: z.literal("decline") }),
]);
export type ProtectedInputAnswer = z.infer<typeof protectedInputAnswerSchema>;
