import { agentSchema, conversationSchema, type Agent, type Conversation } from "@raypx/core/agents";
import type { agents, conversations } from "@raypx/database/schema";

export function agentView(row: typeof agents.$inferSelect, lastActivityAt: Date | null): Agent {
  return agentSchema.parse({
    id: row.id,
    spaceId: row.spaceId,
    name: row.name,
    instructions: row.instructions,
    model: { modelId: row.modelId },
    allowSharedMemory: row.allowSharedMemory,
    allowCrossSpaceMessages: row.allowCrossSpaceMessages,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastActivityAt: lastActivityAt?.toISOString() ?? null,
  });
}
export function conversationView(
  row: typeof conversations.$inferSelect,
  lastActivityAt: Date | null,
): Conversation {
  return conversationSchema.parse({
    id: row.id,
    spaceId: row.spaceId,
    agentId: row.agentId,
    kind: row.kind,
    ...(row.kind === "group"
      ? { name: row.name, defaultResponderAgentId: row.defaultResponderAgentId }
      : {}),
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: lastActivityAt?.toISOString() ?? null,
  });
}
