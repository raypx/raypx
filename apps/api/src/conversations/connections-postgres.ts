import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  modelConnections,
  modelConnectionSecrets,
  modelConnectionSpaces,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import type { ModelConnectionConfiguration } from "@raypx/core/model-connections";
import type { SpaceId } from "@raypx/core/spaces";
import {
  ModelConnectionError,
  type ModelConnectionsRepository,
  type StoredModelConnection,
} from "./connections.js";

type Row = typeof modelConnections.$inferSelect;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export function createModelConnectionsRepository(db: Database): ModelConnectionsRepository {
  function owned(accountId: string, id: string) {
    return and(eq(modelConnections.accountId, accountId), eq(modelConnections.id, id));
  }
  async function project(
    tx: Database | Transaction,
    rows: Row[],
  ): Promise<StoredModelConnection[]> {
    if (!rows.length) return [];
    const selections = await tx
      .select()
      .from(modelConnectionSpaces)
      .where(
        inArray(
          modelConnectionSpaces.connectionId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(modelConnectionSpaces.connectionId), asc(modelConnectionSpaces.spaceId));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      baseUrl: row.baseUrl,
      api: row.api,
      models: row.models,
      secretId: row.secretId,
      availability:
        row.availability === "all"
          ? { mode: "all" }
          : {
              mode: "selected",
              spaceIds: selections
                .filter((item) => item.connectionId === row.id)
                .map((item) => item.spaceId as SpaceId),
            },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
  async function selection(
    tx: Transaction,
    accountId: string,
    connectionId: string,
    input: ModelConnectionConfiguration,
  ) {
    await tx
      .delete(modelConnectionSpaces)
      .where(
        and(
          eq(modelConnectionSpaces.accountId, accountId),
          eq(modelConnectionSpaces.connectionId, connectionId),
        ),
      );
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
    if (members.length !== ids.length) throw new ModelConnectionError("NOT_FOUND");
    await tx
      .insert(modelConnectionSpaces)
      .values(ids.map((spaceId) => ({ connectionId, accountId, spaceId })));
  }
  function values(input: ModelConnectionConfiguration) {
    return {
      name: input.name,
      kind: input.kind,
      baseUrl: input.baseUrl,
      api: input.api,
      models: input.models,
      availability: input.availability.mode,
    };
  }
  return {
    async list(accountId, spaceId) {
      return db.transaction(
        async (tx) => {
          const available =
            spaceId === undefined
              ? undefined
              : and(
                  sql`exists (select 1 from ${spaceMembers} inner join ${spaces} on ${spaces.id} = ${spaceMembers.spaceId} where ${spaceMembers.accountId} = ${accountId} and ${spaceMembers.spaceId} = ${spaceId} and ${spaceMembers.removedAt} is null and ${spaces.deletionClaimedAt} is null)`,
                  or(
                    eq(modelConnections.availability, "all"),
                    sql`exists (select 1 from ${modelConnectionSpaces} where ${modelConnectionSpaces.connectionId} = ${modelConnections.id} and ${modelConnectionSpaces.accountId} = ${accountId} and ${modelConnectionSpaces.spaceId} = ${spaceId})`,
                  ),
                );
          const rows = await tx
            .select()
            .from(modelConnections)
            .where(and(eq(modelConnections.accountId, accountId), available))
            .orderBy(asc(modelConnections.createdAt), asc(modelConnections.id))
            .limit(100);
          return project(tx, rows);
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async get(accountId, id) {
      return db.transaction(
        async (tx) => {
          const rows = await tx
            .select()
            .from(modelConnections)
            .where(owned(accountId, id))
            .limit(1);
          if (!rows.length) throw new ModelConnectionError("NOT_FOUND");
          return (await project(tx, rows))[0]!;
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async create(accountId, id, secretId, input, secret) {
      return db.transaction(async (tx) => {
        const [account] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, accountId))
          .for("update");
        if (!account) throw new ModelConnectionError("NOT_FOUND");
        const count = await tx
          .select({ id: modelConnections.id })
          .from(modelConnections)
          .where(eq(modelConnections.accountId, accountId))
          .orderBy(asc(modelConnections.id))
          .limit(100);
        if (count.length === 100) throw new ModelConnectionError("CONNECTION_LIMIT");
        const rows = await tx
          .insert(modelConnections)
          .values({ id, accountId, secretId, ...values(input) })
          .returning();
        await tx
          .insert(modelConnectionSecrets)
          .values({ id: secretId, connectionId: id, accountId, ...secret });
        await selection(tx, accountId, id, input);
        return (await project(tx, rows))[0]!;
      });
    },
    async update(accountId, id, input, secret) {
      return db.transaction(async (tx) => {
        const rows = await tx
          .update(modelConnections)
          .set({ ...values(input), updatedAt: new Date() })
          .where(owned(accountId, id))
          .returning();
        if (!rows.length) throw new ModelConnectionError("NOT_FOUND");
        if (secret)
          await tx
            .update(modelConnectionSecrets)
            .set({ ...secret, updatedAt: new Date() })
            .where(
              and(
                eq(modelConnectionSecrets.accountId, accountId),
                eq(modelConnectionSecrets.connectionId, id),
              ),
            );
        await selection(tx, accountId, id, input);
        return (await project(tx, rows))[0]!;
      });
    },
    async delete(accountId, id) {
      const rows = await db
        .delete(modelConnections)
        .where(owned(accountId, id))
        .returning({ id: modelConnections.id });
      if (!rows.length) throw new ModelConnectionError("NOT_FOUND");
      return { deleted: true };
    },
  };
}
