import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  agents,
  spaces,
  conversations,
  conversationParticipants as participants,
  conversationRuns as runs,
} from "@raypx/database/schema";
import {
  GroupConversationError,
  groupConversationInputSchema,
  type AgentId,
  type Conversation,
  type ConversationId,
} from "@raypx/core/agents";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { ConversationsRepository } from "../conversations.js";
import { conversationView } from "../views.js";
import { lastConversationActivity } from "./activity.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Selection = Pick<SpaceScope, "spaceId">;
interface Hooks {
  lock(tx: Transaction, scope: Selection, id: ConversationId): Promise<unknown>;
  cancelRun(tx: Transaction, scope: Selection, run: typeof runs.$inferSelect): Promise<unknown>;
}
export function createGroupsRepository(db: Pick<Database, "transaction">, hooks: Hooks) {
  async function admitSpace(tx: Transaction, scope: Selection) {
    const [space] = await tx
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.id, scope.spaceId), isNull(spaces.deletionClaimedAt)))
      .for("share");
    if (!space) throw new SpaceNotFound();
  }
  const selected = (scope: Selection, id: ConversationId) =>
    and(
      eq(conversations.spaceId, scope.spaceId),
      eq(conversations.id, id),
      eq(conversations.kind, "group"),
    );
  const participantSelection = (scope: Selection, id: ConversationId) =>
    and(
      eq(participants.spaceId, scope.spaceId),
      eq(participants.conversationId, id),
      isNull(participants.removedAt),
    );
  async function view(
    tx: Transaction,
    scope: Selection,
    id: ConversationId,
  ): Promise<Conversation> {
    const [row] = await tx
      .select({ conversation: conversations, lastActivityAt: lastConversationActivity() })
      .from(conversations)
      .where(selected(scope, id));
    if (!row) throw new SpaceNotFound();
    const members = await tx
      .select({ id: participants.agentId })
      .from(participants)
      .where(participantSelection(scope, id))
      .orderBy(asc(participants.createdAt), asc(participants.agentId));
    return {
      ...conversationView(row.conversation, row.lastActivityAt),
      agentIds: members.map((m) => m.id as AgentId),
    };
  }
  async function requireAgent(tx: Transaction, scope: Selection, id: AgentId) {
    const [row] = await tx
      .select()
      .from(agents)
      .where(and(eq(agents.spaceId, scope.spaceId), eq(agents.id, id), isNull(agents.deletedAt)))
      .for("share");
    if (!row) throw new SpaceNotFound();
  }
  async function remove(
    tx: Transaction,
    scope: Selection,
    id: ConversationId,
    agentId: AgentId,
    deleted = false,
  ) {
    await admitSpace(tx, scope);
    await hooks.lock(tx, scope, id);
    const group = await view(tx, scope, id);
    const ids = group.agentIds!;
    if (!ids.includes(agentId)) throw new GroupConversationError("GROUP_AGENT_NOT_PARTICIPANT");
    if (ids.length <= 2 && !deleted) throw new GroupConversationError("GROUP_MIN_AGENTS");
    const active = await tx
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.spaceId, scope.spaceId),
          eq(runs.conversationId, id),
          eq(runs.agentId, agentId),
        ),
      )
      .orderBy(asc(runs.id))
      .for("update");
    for (const run of active) await hooks.cancelRun(tx, scope, run);
    if (deleted && ids.length <= 2) {
      const all = await tx
        .select()
        .from(runs)
        .where(and(eq(runs.spaceId, scope.spaceId), eq(runs.conversationId, id)))
        .orderBy(asc(runs.id))
        .for("update");
      for (const run of all) await hooks.cancelRun(tx, scope, run);
      await tx.delete(conversations).where(selected(scope, id));
      return group;
    }
    await tx
      .update(participants)
      .set({ removedAt: new Date() })
      .where(and(participantSelection(scope, id), eq(participants.agentId, agentId)));
    const remaining = ids.filter((x) => x !== agentId);
    await tx
      .update(conversations)
      .set({
        agentId: group.agentId,
        ...(group.agentId === agentId && remaining[0] ? { agentId: remaining[0] } : {}),
        ...(group.defaultResponderAgentId === agentId ? { defaultResponderAgentId: null } : {}),
      })
      .where(selected(scope, id));
    return view(tx, scope, id);
  }
  const methods: Pick<
    ConversationsRepository,
    | "createGroup"
    | "listGroups"
    | "getGroup"
    | "renameGroup"
    | "addGroupAgent"
    | "removeGroupAgent"
    | "setGroupDefaultResponder"
    | "deleteGroup"
  > = {
    async createGroup(scope, input) {
      const values = groupConversationInputSchema.parse(input);
      return db.transaction(async (tx) => {
        await admitSpace(tx, scope);
        for (const id of [...values.agentIds].sort()) await requireAgent(tx, scope, id);
        if (
          values.defaultResponderAgentId &&
          !values.agentIds.includes(values.defaultResponderAgentId)
        )
          throw new GroupConversationError("GROUP_AGENT_NOT_PARTICIPANT");
        const id = crypto.randomUUID() as ConversationId;
        await tx.insert(conversations).values({
          spaceId: scope.spaceId,
          id,
          agentId: values.agentIds[0]!,
          kind: "group",
          name: values.name,
          defaultResponderAgentId: values.defaultResponderAgentId ?? null,
        });
        await tx.insert(participants).values(
          values.agentIds.map((agentId) => ({
            spaceId: scope.spaceId,
            conversationId: id,
            agentId,
          })),
        );
        return view(tx, scope, id);
      });
    },
    async listGroups(scope, limit) {
      return db.transaction(async (tx) => {
        const rows = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(and(eq(conversations.spaceId, scope.spaceId), eq(conversations.kind, "group")))
          .orderBy(asc(conversations.createdAt), asc(conversations.id))
          .limit(Math.max(1, Math.min(100, limit)));
        return Promise.all(rows.map((r) => view(tx, scope, r.id as ConversationId)));
      });
    },
    async getGroup(scope, id) {
      return db.transaction((tx) => view(tx, scope, id));
    },
    async renameGroup(scope, id, name) {
      return db.transaction(async (tx) => {
        await admitSpace(tx, scope);
        await hooks.lock(tx, scope, id);
        await view(tx, scope, id);
        await tx
          .update(conversations)
          .set({ name: groupConversationInputSchema.shape.name.parse(name) })
          .where(selected(scope, id));
        return view(tx, scope, id);
      });
    },
    async addGroupAgent(scope, id, agentId) {
      return db.transaction(async (tx) => {
        await admitSpace(tx, scope);
        await hooks.lock(tx, scope, id);
        const group = await view(tx, scope, id);
        await requireAgent(tx, scope, agentId);
        if (group.agentIds!.length >= 32 && !group.agentIds!.includes(agentId))
          throw new GroupConversationError("GROUP_AGENT_LIMIT");
        await tx
          .insert(participants)
          .values({ spaceId: scope.spaceId, conversationId: id, agentId })
          .onConflictDoUpdate({
            target: [participants.spaceId, participants.conversationId, participants.agentId],
            set: { removedAt: null },
          });
        return view(tx, scope, id);
      });
    },
    async removeGroupAgent(scope, id, agentId) {
      return db.transaction((tx) => remove(tx, scope, id, agentId));
    },
    async setGroupDefaultResponder(scope, id, agentId) {
      return db.transaction(async (tx) => {
        await admitSpace(tx, scope);
        await hooks.lock(tx, scope, id);
        const group = await view(tx, scope, id);
        if (agentId && !group.agentIds!.includes(agentId))
          throw new GroupConversationError("GROUP_AGENT_NOT_PARTICIPANT");
        await tx
          .update(conversations)
          .set({ defaultResponderAgentId: agentId })
          .where(selected(scope, id));
        return view(tx, scope, id);
      });
    },
    async deleteGroup(scope, id) {
      return db.transaction(async (tx) => {
        await admitSpace(tx, scope);
        await hooks.lock(tx, scope, id);
        await view(tx, scope, id);
        const active = await tx
          .select()
          .from(runs)
          .where(and(eq(runs.spaceId, scope.spaceId), eq(runs.conversationId, id)))
          .orderBy(asc(runs.id))
          .for("update");
        for (const run of active) await hooks.cancelRun(tx, scope, run);
        await tx.delete(conversations).where(selected(scope, id));
        return { deleted: true };
      });
    },
  };
  return {
    ...methods,
    async removeDeletedAgent(scope: SpaceScope, agentId: AgentId) {
      await db.transaction(async (tx) => {
        await admitSpace(tx, scope);
        const rows = await tx
          .select({ id: participants.conversationId })
          .from(participants)
          .where(
            and(
              eq(participants.spaceId, scope.spaceId),
              eq(participants.agentId, agentId),
              isNull(participants.removedAt),
            ),
          )
          .orderBy(asc(participants.conversationId));
        for (const row of rows) await remove(tx, scope, row.id as ConversationId, agentId, true);
      });
    },
  };
}
