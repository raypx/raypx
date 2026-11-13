import { agentSchema, conversationSchema, type Agent, type Conversation } from "@raypx/core/agents";
import type { agents, conversations } from "@raypx/database/schema";

export function agentView(row: typeof agents.$inferSelect): Agent {
  return agentSchema.parse({
    id: row.id,
    spaceId: row.spaceId,
    name: row.name,
    instructions: row.instructions,
    model: { modelId: row.modelId },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
export function conversationView(row: typeof conversations.$inferSelect): Conversation {
  return conversationSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
}
