import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  agentMcpServers,
  agents,
  mcpServers,
  mcpServerSecrets,
  mcpServerSpaces,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import type { McpServerConfiguration } from "@raypx/core/mcp-servers";
import type { SpaceId } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { AgentId } from "@raypx/core/agents";
import { McpServerError, type McpServersRepository, type StoredMcpServer } from "./mcp-servers.js";

type Row = typeof mcpServers.$inferSelect;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export function createMcpServersRepository(db: Database): McpServersRepository {
  function owned(accountId: string, id: string) {
    return and(eq(mcpServers.accountId, accountId), eq(mcpServers.id, id));
  }
  async function project(tx: Database | Transaction, rows: Row[]): Promise<StoredMcpServer[]> {
    if (!rows.length) return [];
    const selections = await tx
      .select()
      .from(mcpServerSpaces)
      .where(
        inArray(
          mcpServerSpaces.serverId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(mcpServerSpaces.serverId), asc(mcpServerSpaces.spaceId));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      transport: "http" as const,
      url: row.url,
      hasCredentials: row.hasCredentials,
      secretId: row.secretId,
      availability:
        row.availability === "all"
          ? { mode: "all" }
          : {
              mode: "selected",
              spaceIds: selections
                .filter((item) => item.serverId === row.id)
                .map((item) => item.spaceId as SpaceId),
            },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
  async function selection(
    tx: Transaction,
    accountId: string,
    serverId: string,
    input: McpServerConfiguration,
  ) {
    await tx
      .delete(mcpServerSpaces)
      .where(and(eq(mcpServerSpaces.accountId, accountId), eq(mcpServerSpaces.serverId, serverId)));
    if (input.availability.mode !== "selected" || !input.availability.spaceIds.length) return;
    const ids = input.availability.spaceIds;
    const members = await tx
      .select({ id: spaceMembers.spaceId })
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.accountId, accountId),
          inArray(spaceMembers.spaceId, ids),
          isNull(spaceMembers.removedAt),
          sql`exists (select 1 from ${spaces} where ${spaces.id} = ${spaceMembers.spaceId} and ${spaces.deletionClaimedAt} is null)`,
        ),
      )
      .orderBy(asc(spaceMembers.spaceId))
      .for("key share");
    if (members.length !== ids.length) throw new McpServerError("NOT_FOUND");
    await tx
      .insert(mcpServerSpaces)
      .values(ids.map((spaceId) => ({ serverId, accountId, spaceId })));
  }
  function values(input: McpServerConfiguration) {
    return {
      name: input.name,
      url: input.url,
      availability: input.availability.mode,
    };
  }
  async function checkAgent(tx: Database | Transaction, scope: SpaceScope, agentId: AgentId) {
    const [row] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.spaceId, scope.spaceId),
          eq(agents.id, agentId),
          isNull(agents.deletedAt),
          sql`exists (select 1 from ${spaceMembers} inner join ${spaces} on ${spaces.id} = ${spaceMembers.spaceId} where ${spaceMembers.spaceId} = ${scope.spaceId} and ${spaceMembers.accountId} = ${scope.member.accountId} and ${spaceMembers.removedAt} is null and ${spaces.deletionClaimedAt} is null)`,
        ),
      )
      .limit(1);
    if (!row) throw new McpServerError("NOT_FOUND");
  }
  async function enabled(
    tx: Database | Transaction,
    scope: SpaceScope,
    agentId: AgentId,
  ): Promise<string[]> {
    await checkAgent(tx, scope, agentId);
    const rows = await tx
      .select({ id: agentMcpServers.serverId })
      .from(agentMcpServers)
      .innerJoin(
        mcpServers,
        and(
          eq(mcpServers.id, agentMcpServers.serverId),
          eq(mcpServers.accountId, agentMcpServers.accountId),
        ),
      )
      .where(
        and(
          eq(agentMcpServers.spaceId, scope.spaceId),
          eq(agentMcpServers.agentId, agentId),
          eq(agentMcpServers.accountId, scope.member.accountId),
          or(
            eq(mcpServers.availability, "all"),
            sql`exists (select 1 from ${mcpServerSpaces} where ${mcpServerSpaces.serverId} = ${mcpServers.id} and ${mcpServerSpaces.accountId} = ${scope.member.accountId} and ${mcpServerSpaces.spaceId} = ${scope.spaceId})`,
          ),
        ),
      )
      .orderBy(asc(agentMcpServers.serverId));
    return rows.map((row) => row.id);
  }
  return {
    async enabled(scope, agentId) {
      return enabled(db, scope, agentId);
    },
    async setEnabled(scope, agentId, ids) {
      if (ids.length > 32 || new Set(ids).size !== ids.length)
        throw new McpServerError("INVALID_MCP_SERVER");
      return db.transaction(async (tx) => {
        await checkAgent(tx, scope, agentId);
        await tx
          .select({ id: agents.id })
          .from(agents)
          .where(and(eq(agents.spaceId, scope.spaceId), eq(agents.id, agentId)))
          .for("update");
        const rows = ids.length
          ? await tx
              .select({ id: mcpServers.id })
              .from(mcpServers)
              .where(
                and(
                  eq(mcpServers.accountId, scope.member.accountId),
                  inArray(mcpServers.id, ids),
                  or(
                    eq(mcpServers.availability, "all"),
                    sql`exists (select 1 from ${mcpServerSpaces} where ${mcpServerSpaces.serverId} = ${mcpServers.id} and ${mcpServerSpaces.accountId} = ${scope.member.accountId} and ${mcpServerSpaces.spaceId} = ${scope.spaceId})`,
                  ),
                ),
              )
              .orderBy(asc(mcpServers.id))
              .for("key share")
          : [];
        if (rows.length !== ids.length) throw new McpServerError("NOT_FOUND");
        await tx
          .delete(agentMcpServers)
          .where(
            and(
              eq(agentMcpServers.spaceId, scope.spaceId),
              eq(agentMcpServers.agentId, agentId),
              eq(agentMcpServers.accountId, scope.member.accountId),
            ),
          );
        if (ids.length)
          await tx.insert(agentMcpServers).values(
            ids.map((serverId) => ({
              spaceId: scope.spaceId,
              agentId,
              accountId: scope.member.accountId,
              serverId,
            })),
          );
        return enabled(tx, scope, agentId);
      });
    },
    async readSecret(accountId, id, secretId) {
      const [row] = await db
        .select()
        .from(mcpServerSecrets)
        .where(
          and(
            eq(mcpServerSecrets.accountId, accountId),
            eq(mcpServerSecrets.serverId, id),
            eq(mcpServerSecrets.id, secretId),
          ),
        )
        .limit(1);
      if (!row) throw new McpServerError("NOT_FOUND");
      return { ciphertext: row.ciphertext, wrappedDataKey: row.wrappedDataKey, keyId: row.keyId };
    },
    async list(accountId, spaceId) {
      return db.transaction(
        async (tx) => {
          const available =
            spaceId === undefined
              ? undefined
              : and(
                  sql`exists (select 1 from ${spaceMembers} inner join ${spaces} on ${spaces.id} = ${spaceMembers.spaceId} where ${spaceMembers.accountId} = ${accountId} and ${spaceMembers.spaceId} = ${spaceId} and ${spaceMembers.removedAt} is null and ${spaces.deletionClaimedAt} is null)`,
                  or(
                    eq(mcpServers.availability, "all"),
                    sql`exists (select 1 from ${mcpServerSpaces} where ${mcpServerSpaces.serverId} = ${mcpServers.id} and ${mcpServerSpaces.accountId} = ${accountId} and ${mcpServerSpaces.spaceId} = ${spaceId})`,
                  ),
                );
          const rows = await tx
            .select()
            .from(mcpServers)
            .where(and(eq(mcpServers.accountId, accountId), available))
            .orderBy(asc(mcpServers.createdAt), asc(mcpServers.id))
            .limit(100);
          return project(tx, rows);
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async get(accountId, id) {
      return db.transaction(
        async (tx) => {
          const rows = await tx.select().from(mcpServers).where(owned(accountId, id)).limit(1);
          if (!rows.length) throw new McpServerError("NOT_FOUND");
          return (await project(tx, rows))[0]!;
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async create(accountId, id, secretId, input, secret, hasCredentials) {
      return db.transaction(async (tx) => {
        const [account] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, accountId))
          .for("update");
        if (!account) throw new McpServerError("NOT_FOUND");
        const count = await tx
          .select({ id: mcpServers.id })
          .from(mcpServers)
          .where(eq(mcpServers.accountId, accountId))
          .orderBy(asc(mcpServers.id))
          .limit(100);
        if (count.length === 100) throw new McpServerError("MCP_SERVER_LIMIT");
        const rows = await tx
          .insert(mcpServers)
          .values({ id, accountId, secretId, hasCredentials, ...values(input) })
          .returning();
        await tx
          .insert(mcpServerSecrets)
          .values({ id: secretId, serverId: id, accountId, ...secret });
        await selection(tx, accountId, id, input);
        return (await project(tx, rows))[0]!;
      });
    },
    async update(accountId, id, input, secret, hasCredentials) {
      return db.transaction(async (tx) => {
        const rows = await tx
          .update(mcpServers)
          .set({
            ...values(input),
            ...(hasCredentials === undefined ? {} : { hasCredentials }),
            updatedAt: new Date(),
          })
          .where(owned(accountId, id))
          .returning();
        if (!rows.length) throw new McpServerError("NOT_FOUND");
        if (secret)
          await tx
            .update(mcpServerSecrets)
            .set({ ...secret, updatedAt: new Date() })
            .where(
              and(eq(mcpServerSecrets.accountId, accountId), eq(mcpServerSecrets.serverId, id)),
            );
        await selection(tx, accountId, id, input);
        return (await project(tx, rows))[0]!;
      });
    },
    async delete(accountId, id) {
      const rows = await db
        .delete(mcpServers)
        .where(owned(accountId, id))
        .returning({ id: mcpServers.id });
      if (!rows.length) throw new McpServerError("NOT_FOUND");
      return { deleted: true };
    },
  };
}
