import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  openApiServers,
  openApiServerAgents,
  openApiServerSecrets,
  agents,
  spaces,
  spaceMembers,
} from "@raypx/database/schema";
import type { SpaceScope } from "@raypx/spaces/server";
import type { OpenApiToolOperation } from "@raypx/providers/openapi";
import type { AgentId } from "@raypx/core/agents";
import {
  OpenApiServerError,
  type OpenApiServersRepository,
  type StoredOpenApiServer,
} from "./openapi-servers.js";
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Row = typeof openApiServers.$inferSelect;
export function createOpenApiServersRepository(db: Database): OpenApiServersRepository {
  function scoped(scope: SpaceScope, id?: string) {
    return and(
      eq(openApiServers.spaceId, scope.spaceId),
      id === undefined ? undefined : eq(openApiServers.id, id),
    );
  }
  async function admission(tx: Database | Transaction, scope: SpaceScope, owner = false) {
    const [member] = await tx
      .select({ id: spaceMembers.accountId, role: spaceMembers.role })
      .from(spaceMembers)
      .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
      .where(
        and(
          eq(spaceMembers.spaceId, scope.spaceId),
          eq(spaceMembers.accountId, scope.member.accountId),
          isNull(spaceMembers.removedAt),
          isNull(spaces.deletionClaimedAt),
        ),
      )
      .limit(1);
    if (!member) throw new OpenApiServerError("NOT_FOUND");
    if (owner && member.role !== "owner") throw new OpenApiServerError("OWNER_REQUIRED");
  }
  async function project(tx: Database | Transaction, rows: Row[]): Promise<StoredOpenApiServer[]> {
    if (!rows.length) return [];
    const selections = await tx
      .select()
      .from(openApiServerAgents)
      .where(
        and(
          eq(openApiServerAgents.spaceId, rows[0]!.spaceId),
          inArray(
            openApiServerAgents.serverId,
            rows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(asc(openApiServerAgents.agentId));
    return rows.map((row) => {
      const toolOperations = row.operations as OpenApiToolOperation[];
      return {
        id: row.id,
        spaceId: row.spaceId as SpaceScope["spaceId"],
        secretId: row.secretId,
        credentialOwnerId: row.credentialOwnerId,
        name: row.name,
        url: row.url,
        toolOperations,
        operations: toolOperations.map(({ operationId, label, method, path, readOnly }) => ({
          operationId,
          label,
          method,
          path,
          readOnly,
        })),
        selectedOperationIds: row.selectedOperationIds,
        availability:
          row.availability === "all"
            ? { mode: "all" as const }
            : {
                mode: "selected" as const,
                agentIds: selections
                  .filter((item) => item.serverId === row.id)
                  .map((item) => item.agentId as AgentId),
              },
        hasCredentials: row.hasCredentials,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }
  async function selection(tx: Transaction, scope: SpaceScope, row: StoredOpenApiServer) {
    const ids = row.availability.mode === "all" ? [] : row.availability.agentIds;
    if (ids.length) {
      const found = await tx
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(eq(agents.spaceId, scope.spaceId), inArray(agents.id, ids), isNull(agents.deletedAt)),
        )
        .limit(100);
      if (found.length !== ids.length) throw new OpenApiServerError("NOT_FOUND");
    }
    await tx
      .delete(openApiServerAgents)
      .where(
        and(
          eq(openApiServerAgents.spaceId, scope.spaceId),
          eq(openApiServerAgents.serverId, row.id),
        ),
      );
    if (ids.length)
      await tx
        .insert(openApiServerAgents)
        .values(ids.map((agentId) => ({ spaceId: scope.spaceId, serverId: row.id, agentId })));
  }
  function values(row: StoredOpenApiServer) {
    return {
      name: row.name,
      url: row.url,
      operations: row.toolOperations,
      selectedOperationIds: row.selectedOperationIds,
      availability: row.availability.mode,
      hasCredentials: row.hasCredentials,
      updatedAt: new Date(row.updatedAt),
    };
  }
  return {
    async list(scope) {
      return db.transaction(
        async (tx) => {
          await admission(tx, scope);
          return project(
            tx,
            await tx
              .select()
              .from(openApiServers)
              .where(scoped(scope))
              .orderBy(asc(openApiServers.createdAt), asc(openApiServers.id))
              .limit(32),
          );
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async get(scope, id) {
      return db.transaction(
        async (tx) => {
          await admission(tx, scope);
          const rows = await tx.select().from(openApiServers).where(scoped(scope, id)).limit(1);
          if (!rows.length) throw new OpenApiServerError("NOT_FOUND");
          return (await project(tx, rows))[0]!;
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async create(scope, row, secret) {
      return db.transaction(async (tx) => {
        await admission(tx, scope, true);
        const [space] = await tx
          .select({ id: spaces.id })
          .from(spaces)
          .where(eq(spaces.id, scope.spaceId))
          .for("update");
        if (!space) throw new OpenApiServerError("NOT_FOUND");
        const count = await tx
          .select({ id: openApiServers.id })
          .from(openApiServers)
          .where(scoped(scope))
          .limit(32);
        if (count.length === 32) throw new OpenApiServerError("SERVER_LIMIT");
        const rows = await tx
          .insert(openApiServers)
          .values({
            ...values(row),
            spaceId: scope.spaceId,
            id: row.id,
            secretId: row.secretId,
            credentialOwnerId: row.credentialOwnerId,
            createdAt: new Date(row.createdAt),
          })
          .returning();
        await tx
          .insert(openApiServerSecrets)
          .values({ spaceId: scope.spaceId, serverId: row.id, id: row.secretId, ...secret });
        await selection(tx, scope, row);
        return (await project(tx, rows))[0]!;
      });
    },
    async update(scope, row, secret) {
      return db.transaction(async (tx) => {
        await admission(tx, scope, true);
        const rows = await tx
          .update(openApiServers)
          .set(values(row))
          .where(scoped(scope, row.id))
          .returning();
        if (!rows.length) throw new OpenApiServerError("NOT_FOUND");
        if (secret)
          await tx
            .update(openApiServerSecrets)
            .set(secret)
            .where(
              and(
                eq(openApiServerSecrets.spaceId, scope.spaceId),
                eq(openApiServerSecrets.serverId, row.id),
              ),
            );
        await selection(tx, scope, row);
        return (await project(tx, rows))[0]!;
      });
    },
    async delete(scope, id) {
      await admission(db, scope, true);
      const rows = await db
        .delete(openApiServers)
        .where(scoped(scope, id))
        .returning({ id: openApiServers.id });
      if (!rows.length) throw new OpenApiServerError("NOT_FOUND");
      return { deleted: true };
    },
    async readSecret(scope, id, secretId) {
      await admission(db, scope);
      const [row] = await db
        .select()
        .from(openApiServerSecrets)
        .where(
          and(
            eq(openApiServerSecrets.spaceId, scope.spaceId),
            eq(openApiServerSecrets.serverId, id),
            eq(openApiServerSecrets.id, secretId),
          ),
        )
        .limit(1);
      if (!row) throw new OpenApiServerError("NOT_FOUND");
      return { ciphertext: row.ciphertext, wrappedDataKey: row.wrappedDataKey, keyId: row.keyId };
    },
  };
}
