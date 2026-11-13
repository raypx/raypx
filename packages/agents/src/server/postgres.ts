import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { agents, conversations } from "@raypx/database/schema";
import type { SpaceScope } from "@raypx/spaces/server";
import { SpaceNotFound } from "@raypx/core/spaces";
import {
  agentIdSchema,
  agentInputSchema,
  conversationIdSchema,
  directConversation,
  type AgentId,
  type AgentInput,
} from "@raypx/core/agents";

import type { AgentConversation, AgentsRepository } from "../server.js";
import { agentView, conversationView } from "../views.js";
function values(input: AgentInput) {
  const parsed = agentInputSchema.parse(input);
  return {
    name: parsed.name,
    instructions: parsed.instructions,
    modelId: parsed.model.modelId,
    ...(parsed.allowSharedMemory === undefined
      ? {}
      : { allowSharedMemory: parsed.allowSharedMemory }),
  };
}
type AgentDatabase = Pick<Database, "select" | "insert" | "update" | "delete" | "transaction">;
export function createAgentsRepository(db: AgentDatabase): AgentsRepository {
  async function get(scope: SpaceScope, id: AgentId): Promise<AgentConversation> {
    const [row] = await db
      .select({ agent: agents, conversation: conversations })
      .from(agents)
      .innerJoin(
        conversations,
        and(eq(conversations.spaceId, agents.spaceId), eq(conversations.agentId, agents.id)),
      )
      .where(and(eq(agents.spaceId, scope.spaceId), eq(agents.id, id)))
      .limit(1);
    if (!row) throw new SpaceNotFound();
    return { agent: agentView(row.agent), conversation: conversationView(row.conversation) };
  }
  return {
    get,
    async list(scope: SpaceScope, limit: number): Promise<AgentConversation[]> {
      const rows = await db
        .select({ agent: agents, conversation: conversations })
        .from(agents)
        .innerJoin(
          conversations,
          and(eq(conversations.spaceId, agents.spaceId), eq(conversations.agentId, agents.id)),
        )
        .where(eq(agents.spaceId, scope.spaceId))
        .orderBy(asc(agents.createdAt), asc(agents.id))
        .limit(Math.max(1, Math.min(100, limit)));
      return rows.map((row) => ({
        agent: agentView(row.agent),
        conversation: conversationView(row.conversation),
      }));
    },
    async create(scope: SpaceScope, input: AgentInput): Promise<AgentConversation> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(agents)
          .values({
            ...values(input),
            spaceId: scope.spaceId,
            id: agentIdSchema.parse(crypto.randomUUID()),
          })
          .returning();
        const agent = agentView(row!);
        const conversation = directConversation(
          agent,
          conversationIdSchema.parse(crypto.randomUUID()),
        );
        await tx
          .insert(conversations)
          .values({ ...conversation, createdAt: new Date(conversation.createdAt) });
        return { agent, conversation };
      });
    },
    async update(scope: SpaceScope, id: AgentId, input: AgentInput): Promise<AgentConversation> {
      // Read the matching Conversation in the same transaction as the update.
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(agents)
          .set({ ...values(input), updatedAt: new Date() })
          .where(and(eq(agents.spaceId, scope.spaceId), eq(agents.id, id)))
          .returning();
        if (!row) throw new SpaceNotFound();
        const [conversation] = await tx
          .select()
          .from(conversations)
          .where(and(eq(conversations.spaceId, scope.spaceId), eq(conversations.agentId, id)))
          .limit(1);
        if (!conversation) throw new SpaceNotFound();
        return { agent: agentView(row), conversation: conversationView(conversation) };
      });
    },
    async delete(scope: SpaceScope, id: AgentId): Promise<{ deleted: true }> {
      const [row] = await db
        .delete(agents)
        .where(and(eq(agents.spaceId, scope.spaceId), eq(agents.id, id)))
        .returning({ id: agents.id });
      if (!row) throw new SpaceNotFound();
      return { deleted: true };
    },
  };
}

export { createConversationsRepository } from "./conversations.js";
export { createConversationFanout } from "./fanout.js";
export { createApprovalsRepository } from "./approvals.js";
