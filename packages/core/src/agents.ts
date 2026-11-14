import { z } from "zod";
import { spaceIdSchema } from "./spaces.js";

export const agentIdSchema = z.string().min(1).max(128).brand<"AgentId">();
export type AgentId = z.infer<typeof agentIdSchema>;
export const conversationIdSchema = z.string().min(1).max(128).brand<"ConversationId">();
export type ConversationId = z.infer<typeof conversationIdSchema>;
// An opaque model identifier, resolved by a future connection adapter. No vendor vocabulary.
export const agentModelChoiceSchema = z.strictObject({
  modelId: z.string().trim().min(1).max(200),
});
export const agentInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  instructions: z.string().max(32_000),
  model: agentModelChoiceSchema,
  allowSharedMemory: z.boolean().optional(),
  allowCrossSpaceMessages: z.boolean().optional(),
});
export type AgentInput = z.infer<typeof agentInputSchema>;
export const agentSchema = agentInputSchema.extend({
  id: agentIdSchema,
  spaceId: spaceIdSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastActivityAt: z.iso.datetime().nullable().optional(),
});
export type Agent = z.infer<typeof agentSchema>;
export const conversationSchema = z.strictObject({
  id: conversationIdSchema,
  spaceId: spaceIdSchema,
  agentId: agentIdSchema,
  kind: z.enum(["direct", "group"]),
  name: z.string().trim().min(1).max(120).optional(),
  agentIds: z.array(agentIdSchema).optional(),
  defaultResponderAgentId: agentIdSchema.nullable().optional(),
  createdAt: z.iso.datetime(),
  lastActivityAt: z.iso.datetime().nullable().optional(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export function directConversation(agent: Agent, id: ConversationId): Conversation {
  return {
    id,
    spaceId: agent.spaceId,
    agentId: agent.id,
    kind: "direct",
    createdAt: agent.createdAt,
  };
}

export const groupConversationInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  agentIds: z
    .array(agentIdSchema)
    .min(2)
    .max(32)
    .refine((ids) => new Set(ids).size === ids.length),
  defaultResponderAgentId: agentIdSchema.nullable().optional(),
});
export type GroupConversationInput = z.infer<typeof groupConversationInputSchema>;
export class GroupConversationError extends Error {
  constructor(
    readonly code: "GROUP_MIN_AGENTS" | "GROUP_AGENT_NOT_PARTICIPANT" | "GROUP_AGENT_LIMIT",
  ) {
    super(code);
    this.name = "GroupConversationError";
  }
}
