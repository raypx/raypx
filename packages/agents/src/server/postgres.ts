import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  agents,
  conversations,
  computers,
  routines,
  spaceMemoryDocuments,
  spaces,
} from "@raypx/database/schema";
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
import { lastConversationActivity } from "./activity.js";
function values(input: AgentInput) {
  const parsed = agentInputSchema.parse(input);
  return {
    name: parsed.name,
    instructions: parsed.instructions,
    modelId: parsed.model.modelId,
    ...(parsed.allowCrossSpaceMessages === undefined
      ? {}
      : { allowCrossSpaceMessages: parsed.allowCrossSpaceMessages }),
    ...(parsed.allowSharedMemory === undefined
      ? {}
      : { allowSharedMemory: parsed.allowSharedMemory }),
  };
}
type AgentDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete" | "execute" | "transaction"
>;
export function createAgentsRepository(db: AgentDatabase): AgentsRepository {
  async function get(scope: SpaceScope, id: AgentId): Promise<AgentConversation> {
    const [row] = await db
      .select({
        agent: agents,
        conversation: conversations,
        lastActivityAt: lastConversationActivity(),
      })
      .from(agents)
      .innerJoin(
        conversations,
        and(
          eq(conversations.spaceId, agents.spaceId),
          eq(conversations.agentId, agents.id),
          eq(conversations.kind, "direct"),
        ),
      )
      .where(and(eq(agents.spaceId, scope.spaceId), eq(agents.id, id), isNull(agents.deletedAt)))
      .limit(1);
    if (!row) throw new SpaceNotFound();
    return {
      agent: agentView(row.agent, row.lastActivityAt),
      conversation: conversationView(row.conversation, row.lastActivityAt),
    };
  }
  return {
    get,
    async list(scope: SpaceScope, limit: number): Promise<AgentConversation[]> {
      const rows = await db
        .select({
          agent: agents,
          conversation: conversations,
          lastActivityAt: lastConversationActivity(),
        })
        .from(agents)
        .innerJoin(
          conversations,
          and(
            eq(conversations.spaceId, agents.spaceId),
            eq(conversations.agentId, agents.id),
            eq(conversations.kind, "direct"),
          ),
        )
        .where(and(eq(agents.spaceId, scope.spaceId), isNull(agents.deletedAt)))
        .orderBy(asc(agents.createdAt), asc(agents.id))
        .limit(Math.max(1, Math.min(100, limit)));
      return rows.map((row) => ({
        agent: agentView(row.agent, row.lastActivityAt),
        conversation: conversationView(row.conversation, row.lastActivityAt),
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
        const agent = agentView(row!, null);
        const conversation = directConversation(
          agent,
          conversationIdSchema.parse(crypto.randomUUID()),
        );
        const [savedConversation] = await tx
          .insert(conversations)
          .values({ ...conversation, createdAt: new Date(conversation.createdAt) })
          .returning();
        return { agent, conversation: conversationView(savedConversation!, null) };
      });
    },
    async update(scope: SpaceScope, id: AgentId, input: AgentInput): Promise<AgentConversation> {
      // Read the matching Conversation in the same transaction as the update.
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(agents)
          .set({ ...values(input), updatedAt: new Date() })
          .where(
            and(eq(agents.spaceId, scope.spaceId), eq(agents.id, id), isNull(agents.deletedAt)),
          )
          .returning();
        if (!row) throw new SpaceNotFound();
        const [saved] = await tx
          .select({ conversation: conversations, lastActivityAt: lastConversationActivity() })
          .from(conversations)
          .where(
            and(
              eq(conversations.spaceId, scope.spaceId),
              eq(conversations.agentId, id),
              eq(conversations.kind, "direct"),
            ),
          )
          .limit(1);
        if (!saved) throw new SpaceNotFound();
        return {
          agent: agentView(row, saved.lastActivityAt),
          conversation: conversationView(saved.conversation, saved.lastActivityAt),
        };
      });
    },
    async delete(scope: SpaceScope, id: AgentId): Promise<{ deleted: true }> {
      return db.transaction(async (tx) => {
        const [space] = await tx
          .select({ id: spaces.id })
          .from(spaces)
          .where(and(eq(spaces.id, scope.spaceId), isNull(spaces.deletionClaimedAt)))
          .for("update");
        if (!space) throw new SpaceNotFound();
        const [row] = await tx
          .update(agents)
          .set({ deletedAt: new Date() })
          .where(
            and(eq(agents.spaceId, scope.spaceId), eq(agents.id, id), isNull(agents.deletedAt)),
          )
          .returning({ id: agents.id });
        if (!row) throw new SpaceNotFound();
        await tx
          .delete(computers)
          .where(and(eq(computers.spaceId, scope.spaceId), eq(computers.agentId, id)));
        await tx
          .delete(routines)
          .where(and(eq(routines.spaceId, scope.spaceId), eq(routines.agentId, id)));
        await tx
          .delete(spaceMemoryDocuments)
          .where(
            and(
              eq(spaceMemoryDocuments.spaceId, scope.spaceId),
              eq(spaceMemoryDocuments.agentId, id),
            ),
          );
        await tx
          .delete(conversations)
          .where(
            and(
              eq(conversations.spaceId, scope.spaceId),
              eq(conversations.agentId, id),
              eq(conversations.kind, "direct"),
            ),
          );
        await createConversationsRepository(tx).removeDeletedAgent(scope, id);
        return { deleted: true };
      });
    },
  };
}

import { createConversationsRepository } from "./conversations.js";
export { createConversationsRepository, cancelSpaceRuns } from "./conversations.js";
export { createComputerUseQueue } from "./computer-queue.js";
export { createConversationFanout } from "./fanout.js";
export { createApprovalsRepository } from "./approvals.js";
export { createProtectedInputsService } from "./protected-input.js";
