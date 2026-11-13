import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  agents,
  conversationCounters as counters,
  conversationRuns as runs,
  spaceMembers,
  spaces,
  user,
  memberSkills,
  memberSkillSpaces,
  spaceSkills,
  agentMemberSkills,
  agentSpaceSkills,
  skillMutations,
} from "@raypx/database/schema";
import {
  SkillError,
  skillSchema,
  type Skill,
  type SkillAvailability,
  type SkillContent,
} from "@raypx/core/skills";
import type { SpaceScope } from "@raypx/spaces/server";
import type { AgentId } from "@raypx/core/agents";
import { SkillExecutionFenceError, type SkillRepository, type SkillRunActor } from "./types.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Query = Database | Transaction;
function memberSelector(scope: SpaceScope, id: string) {
  return and(eq(memberSkills.accountId, scope.member.accountId), eq(memberSkills.id, id));
}
function spaceSelector(scope: SpaceScope, id: string) {
  return and(
    eq(spaceSkills.spaceId, scope.spaceId),
    eq(spaceSkills.id, id),
    isNull(spaceSkills.deletedAt),
  );
}
async function requireMember(tx: Query, scope: SpaceScope) {
  const [member] = await tx
    .select({ accountId: spaceMembers.accountId })
    .from(spaceMembers)
    .where(
      and(
        eq(spaceMembers.spaceId, scope.spaceId),
        eq(spaceMembers.accountId, scope.member.accountId),
        isNull(spaceMembers.removedAt),
        sql`exists (select 1 from ${spaces} where ${spaces.id} = ${scope.spaceId} and ${spaces.deletionClaimedAt} is null)`,
      ),
    );
  if (!member) throw new SkillError("SKILL_NOT_FOUND");
}
async function requireAgent(tx: Query, scope: SpaceScope, agentId: AgentId) {
  const [agent] = await tx
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(eq(agents.spaceId, scope.spaceId), eq(agents.id, agentId), isNull(agents.deletedAt)),
    );
  if (!agent) throw new SkillError("SKILL_NOT_FOUND");
}
function availability(scope: SpaceScope) {
  return or(
    eq(memberSkills.availability, "all"),
    sql`exists (select 1 from ${memberSkillSpaces} where ${memberSkillSpaces.skillId} = ${memberSkills.id} and ${memberSkillSpaces.accountId} = ${scope.member.accountId} and ${memberSkillSpaces.spaceId} = ${scope.spaceId})`,
  );
}
async function projectMember(
  tx: Query,
  rows: (typeof memberSkills.$inferSelect)[],
): Promise<Skill[]> {
  if (!rows.length) return [];
  const selected = await tx
    .select()
    .from(memberSkillSpaces)
    .where(
      inArray(
        memberSkillSpaces.skillId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(memberSkillSpaces.skillId), asc(memberSkillSpaces.spaceId));
  return rows.map((row) =>
    skillSchema.parse({
      id: row.id,
      name: row.name,
      description: row.description,
      body: row.body,
      ownership: "account",
      spaceId: null,
      agentId: null,
      availability:
        row.availability === "all"
          ? { mode: "all" }
          : {
              mode: "selected",
              spaceIds: selected
                .filter((item) => item.skillId === row.id)
                .map((item) => item.spaceId),
            },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }),
  );
}
function projectSpace(row: typeof spaceSkills.$inferSelect): Skill {
  return skillSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    body: row.body,
    ownership: "space",
    spaceId: row.spaceId,
    agentId: row.agentId,
    availability: { mode: "selected", spaceIds: [row.spaceId] },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
async function list(tx: Query, scope: SpaceScope, availableOnly: boolean): Promise<Skill[]> {
  await requireMember(tx, scope);
  const account = await tx
    .select()
    .from(memberSkills)
    .where(
      and(
        eq(memberSkills.accountId, scope.member.accountId),
        availableOnly ? availability(scope) : undefined,
      ),
    )
    .orderBy(asc(memberSkills.createdAt), asc(memberSkills.id))
    .limit(100);
  const local = await tx
    .select()
    .from(spaceSkills)
    .where(and(eq(spaceSkills.spaceId, scope.spaceId), isNull(spaceSkills.deletedAt)))
    .orderBy(asc(spaceSkills.createdAt), asc(spaceSkills.id))
    .limit(100);
  return [...(await projectMember(tx, account)), ...local.map(projectSpace)].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
async function get(
  tx: Query,
  scope: SpaceScope,
  id: string,
  availableOnly: boolean,
): Promise<Skill> {
  await requireMember(tx, scope);
  const [account] = await tx
    .select()
    .from(memberSkills)
    .where(and(memberSelector(scope, id), availableOnly ? availability(scope) : undefined));
  if (account) return (await projectMember(tx, [account]))[0]!;
  const [local] = await tx.select().from(spaceSkills).where(spaceSelector(scope, id));
  if (!local) throw new SkillError("SKILL_NOT_FOUND");
  return projectSpace(local);
}
async function selection(tx: Transaction, scope: SpaceScope, id: string, input: SkillAvailability) {
  await tx
    .delete(memberSkillSpaces)
    .where(
      and(
        eq(memberSkillSpaces.accountId, scope.member.accountId),
        eq(memberSkillSpaces.skillId, id),
      ),
    );
  if (input.mode !== "selected" || !input.spaceIds.length) return;
  const members = await tx
    .select({ id: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(
      and(
        eq(spaceMembers.accountId, scope.member.accountId),
        inArray(spaceMembers.spaceId, input.spaceIds),
        isNull(spaceMembers.removedAt),
        sql`exists (select 1 from ${spaces} where ${spaces.id} = ${spaceMembers.spaceId} and ${spaces.deletionClaimedAt} is null)`,
      ),
    )
    .orderBy(asc(spaceMembers.spaceId))
    .for("key share");
  if (members.length !== input.spaceIds.length) throw new SkillError("SKILL_NOT_FOUND");
  await tx.insert(memberSkillSpaces).values(
    input.spaceIds.map((spaceId) => ({
      skillId: id,
      accountId: scope.member.accountId,
      spaceId,
    })),
  );
}
async function enabled(tx: Query, scope: SpaceScope, agentId: AgentId): Promise<Skill[]> {
  await requireAgent(tx, scope, agentId);
  const memberIds = await tx
    .select({ id: agentMemberSkills.skillId })
    .from(agentMemberSkills)
    .where(
      and(
        eq(agentMemberSkills.spaceId, scope.spaceId),
        eq(agentMemberSkills.agentId, agentId),
        eq(agentMemberSkills.accountId, scope.member.accountId),
      ),
    )
    .orderBy(asc(agentMemberSkills.skillId));
  const spaceIds = await tx
    .select({ id: agentSpaceSkills.skillId })
    .from(agentSpaceSkills)
    .where(
      and(
        eq(agentSpaceSkills.spaceId, scope.spaceId),
        eq(agentSpaceSkills.agentId, agentId),
        eq(agentSpaceSkills.accountId, scope.member.accountId),
      ),
    )
    .orderBy(asc(agentSpaceSkills.skillId));
  const ids = new Set([...memberIds, ...spaceIds].map((item) => item.id));
  return (await list(tx, scope, true)).filter((item) => ids.has(item.id));
}
async function execution(tx: Transaction, scope: SpaceScope, actor: SkillRunActor) {
  if (!actor.execution || actor.memberAccountId !== scope.member.accountId)
    throw new SkillExecutionFenceError();
  await tx
    .select({ sequence: counters.sequence })
    .from(counters)
    .where(
      and(
        eq(counters.spaceId, scope.spaceId),
        eq(counters.conversationId, actor.execution.conversationId),
      ),
    )
    .for("update");
  const [row] = await tx
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(
        eq(runs.spaceId, scope.spaceId),
        eq(runs.conversationId, actor.execution.conversationId),
        eq(runs.id, actor.runId),
        eq(runs.agentId, actor.agentId),
        eq(runs.memberAccountId, actor.memberAccountId),
        eq(runs.leaseOwner, actor.execution.ownerId),
        eq(runs.fence, actor.execution.fence),
        sql`${runs.leaseExpiresAt} > clock_timestamp()`,
        or(eq(runs.state, "running"), eq(runs.state, "waiting")),
        sql`exists (select 1 from ${spaceMembers} inner join ${spaces} on ${spaces.id} = ${spaceMembers.spaceId} where ${spaceMembers.spaceId} = ${scope.spaceId} and ${spaceMembers.accountId} = ${actor.memberAccountId} and ${spaceMembers.removedAt} is null and ${spaces.deletionClaimedAt} is null)`,
      ),
    )
    .for("update");
  if (!row) throw new SkillExecutionFenceError();
}
export function createSkillsRepository(db: Database): SkillRepository {
  return {
    list: (scope, availableOnly) =>
      db.transaction((tx) => list(tx, scope, availableOnly), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      }),
    get: (scope, id, availableOnly) =>
      db.transaction((tx) => get(tx, scope, id, availableOnly), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      }),
    async create(scope, id, content, input) {
      return db.transaction(async (tx) => {
        await requireMember(tx, scope);
        const [account] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, scope.member.accountId))
          .for("update");
        if (!account) throw new SkillError("SKILL_NOT_FOUND");
        const count = await tx
          .select({ id: memberSkills.id })
          .from(memberSkills)
          .where(eq(memberSkills.accountId, scope.member.accountId))
          .orderBy(asc(memberSkills.id))
          .limit(100);
        if (count.length === 100) throw new SkillError("SKILL_LIMIT");
        await tx
          .insert(memberSkills)
          .values({ id, accountId: scope.member.accountId, ...content, availability: input.mode });
        await selection(tx, scope, id, input);
        return get(tx, scope, id, false);
      });
    },
    async update(scope, id, content) {
      return db.transaction(async (tx) => {
        const current = await get(tx, scope, id, false);
        if (current.ownership === "account")
          await tx
            .update(memberSkills)
            .set({ ...content, updatedAt: new Date() })
            .where(memberSelector(scope, id));
        else
          await tx
            .update(spaceSkills)
            .set({ ...content, updatedAt: new Date() })
            .where(spaceSelector(scope, id));
        return get(tx, scope, id, false);
      });
    },
    async delete(scope, id) {
      return db.transaction(async (tx) => {
        const current = await get(tx, scope, id, false);
        if (current.ownership === "account")
          await tx.delete(memberSkills).where(memberSelector(scope, id));
        else {
          await tx
            .update(spaceSkills)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(spaceSelector(scope, id));
          await tx
            .delete(agentSpaceSkills)
            .where(
              and(eq(agentSpaceSkills.spaceId, scope.spaceId), eq(agentSpaceSkills.skillId, id)),
            );
        }
        return { deleted: true as const };
      });
    },
    async setAvailability(scope, id, input) {
      return db.transaction(async (tx) => {
        const current = await get(tx, scope, id, false);
        if (current.ownership !== "account") throw new SkillError("SKILL_INVALID");
        await tx
          .update(memberSkills)
          .set({ availability: input.mode, updatedAt: new Date() })
          .where(memberSelector(scope, id));
        await selection(tx, scope, id, input);
        return get(tx, scope, id, false);
      });
    },
    enabled: (scope, agentId) =>
      db.transaction((tx) => enabled(tx, scope, agentId), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      }),
    async setEnabled(scope, agentId, ids) {
      return db.transaction(async (tx) => {
        await requireMember(tx, scope);
        await requireAgent(tx, scope, agentId);
        await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, scope.member.accountId))
          .for("update");
        const available = await list(tx, scope, true);
        const selected: Skill[] = [];
        for (const id of ids) {
          const item = available.find((skill) => skill.id === id);
          if (!item) throw new SkillError("SKILL_NOT_FOUND");
          selected.push(item);
        }
        for (const table of [agentMemberSkills, agentSpaceSkills])
          await tx
            .delete(table)
            .where(
              and(
                eq(table.spaceId, scope.spaceId),
                eq(table.agentId, agentId),
                eq(table.accountId, scope.member.accountId),
              ),
            );
        for (const item of selected) {
          const value = {
            spaceId: scope.spaceId,
            agentId,
            accountId: scope.member.accountId,
            skillId: item.id,
          };
          if (item.ownership === "account") await tx.insert(agentMemberSkills).values(value);
          else await tx.insert(agentSpaceSkills).values(value);
        }
        return (await enabled(tx, scope, agentId)).map(({ id, name, description }) => ({
          id,
          name,
          description,
        }));
      });
    },
    async saveFromRun(scope, actor, callId, id, content: SkillContent) {
      const digest = Buffer.from(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify([id ?? null, content])),
        ),
      ).toString("hex");
      const identity = Buffer.from(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify([actor.runId, callId])),
        ),
      ).toString("hex");
      return db.transaction(async (tx) => {
        await execution(tx, scope, actor);
        const [replay] = await tx
          .select()
          .from(skillMutations)
          .where(
            and(
              eq(skillMutations.spaceId, scope.spaceId),
              eq(skillMutations.runId, actor.runId),
              eq(skillMutations.toolCallId, callId),
            ),
          );
        if (replay) {
          if (replay.digest !== digest) throw new SkillError("SKILL_CONFLICT");
          return replay.result;
        }
        await requireAgent(tx, scope, actor.agentId);
        const skillId = id ?? `skill-${identity.slice(0, 48)}`;
        if (id !== undefined) {
          const [current] = await tx
            .select()
            .from(spaceSkills)
            .where(spaceSelector(scope, id))
            .for("update");
          if (!current) throw new SkillError("SKILL_NOT_FOUND");
          await tx
            .update(spaceSkills)
            .set({ ...content, updatedAt: new Date() })
            .where(spaceSelector(scope, id));
        } else {
          // Serialize Space quota checks independently of concurrent Runs in other Agents.
          await tx
            .select({ id: spaces.id })
            .from(spaces)
            .where(eq(spaces.id, scope.spaceId))
            .for("update");
          const count = await tx
            .select({ id: spaceSkills.id })
            .from(spaceSkills)
            .where(and(eq(spaceSkills.spaceId, scope.spaceId), isNull(spaceSkills.deletedAt)))
            .orderBy(asc(spaceSkills.id))
            .limit(100);
          if (count.length === 100) throw new SkillError("SKILL_LIMIT");
          await tx
            .insert(spaceSkills)
            .values({ spaceId: scope.spaceId, id: skillId, agentId: actor.agentId, ...content });
        }
        const result = { id: skillId };
        await tx.insert(skillMutations).values({
          spaceId: scope.spaceId,
          conversationId: actor.execution.conversationId,
          runId: actor.runId,
          toolCallId: callId,
          skillId,
          digest,
          fence: actor.execution.fence,
          result,
        });
        return result;
      });
    },
  };
}
