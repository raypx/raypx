import type {
  CloudEntities,
  CloudEntityKind,
  CloudQuery,
  CloudRepository,
  CloudTransaction,
  CloudRunEvent,
  CloudUsageTotals,
} from "@raypx/core";
import { sql, eq, and, type SQL } from "drizzle-orm";
import { CloudDomainError, sameCloudTaskRound } from "@raypx/core";
import type { DatabaseConnection } from "../../connection.js";
import { isUniqueViolation } from "@voidmix/drizzle/errors";
import { users, v2Projects, v2ProjectMembers, organizationMembers } from "../../schema.js";
import { cloudRecords, cloudActorId, cloudParentIds, hydrateCloudRecord } from "./records.js";
import { excludedColumn, jsonText, jsonBoolean } from "@voidmix/drizzle/postgres";
import { accountUsageQuery, readyRunsQuery, expiredRunsQuery } from "./queries.js";

type Database = DatabaseConnection["db"];
function txFor(db: Database, writing: boolean): CloudTransaction {
  const records = async <T>(statement: SQL): Promise<T[]> => {
    const rows = await db.execute<{ data: Record<string, unknown> }>(statement);
    return rows.map((row) => hydrateCloudRecord<T>(row.data));
  };
  const held = new Set<string>();
  const lock = async (keys: readonly string[]) => {
    for (const key of [...new Set(keys)].sort())
      if (!held.has(key)) {
        await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`cloud:${key}`},0))`);
        held.add(key);
      }
  };
  return {
    lock,
    accountUsage: async ({ ownerAccountId, from, until }) => {
      const rows = await db.execute<
        { [K in keyof CloudUsageTotals]: number | string } & {
          invalidAccountingValues: number | string;
        }
      >(accountUsageQuery({ ownerAccountId, from, until }));
      const row = rows[0];
      if (!row) throw new Error("Missing account usage aggregate.");
      if (Number(row.invalidAccountingValues) !== 0)
        throw new Error("Invalid persisted account usage values.");
      const totals = {
        calls: Number(row.calls),
        reservedCalls: Number(row.reservedCalls),
        unknownCalls: Number(row.unknownCalls),
        inputTokens: Number(row.inputTokens),
        outputTokens: Number(row.outputTokens),
        estimatedCost: Number(row.estimatedCost),
        storageBytes: Number(row.storageBytes),
        activeRuns: Number(row.activeRuns),
      };
      if (Object.values(totals).some((value) => !Number.isFinite(value)))
        throw new Error("Invalid persisted account usage totals.");
      return totals;
    },
    activeTaskRun: async (taskId) => {
      const rows = await records<CloudEntities["runs"]>(
        sql`SELECT data FROM cloud_runs WHERE task_id=${taskId} AND status IN ('queued','running') LIMIT 1`,
      );
      return rows[0] ?? null;
    },
    readyRuns: (limit) => records<CloudEntities["runs"]>(readyRunsQuery(limit)),
    expiredRuns: (now, limit) => records<CloudEntities["runs"]>(expiredRunsQuery(now, limit)),
    get: async <K extends CloudEntityKind>(kind: K, id: string) => {
      const rows = await records<CloudEntities[K]>(
        sql`SELECT data FROM ${sql.identifier(cloudRecords[kind].table)} WHERE id=${id} LIMIT 1`,
      );
      return rows[0] ?? null;
    },
    list: async <K extends CloudEntityKind>(kind: K, query: CloudQuery = {}) => {
      const conditions = [sql`true`];
      if (query.ownerAccountId)
        conditions.push(
          sql`${kind === "usage" || kind === "runs" ? sql.identifier("owner_account_id") : jsonText(sql.identifier("data"), ["ownerAccountId"])}=${query.ownerAccountId}`,
        );
      if (query.roundId)
        conditions.push(
          sql`${kind === "runs" || kind === "usage" ? sql.identifier("round_id") : jsonText(sql.identifier("data"), ["roundId"])}=${query.roundId}`,
        );
      if (query.runIds) {
        const runId =
          kind === "usage" ? sql.identifier("run_id") : jsonText(sql.identifier("data"), ["runId"]);
        conditions.push(
          query.runIds.length
            ? sql`${runId} IN (${sql.join(
                query.runIds.map((id) => sql`${id}`),
                sql`,`,
              )})`
            : sql`false`,
        );
      }
      if (query.turnIds)
        conditions.push(
          query.turnIds.length
            ? sql`coalesce(${jsonText(sql.identifier("data"), ["sourceTurnId"])},${jsonText(sql.identifier("data"), ["turnId"])}) IN (${sql.join(
                query.turnIds.map((id) => sql`${id}`),
                sql`,`,
              )})`
            : sql`false`,
        );
      if (query.published !== undefined)
        conditions.push(
          sql`${jsonBoolean(sql.identifier("data"), ["published"])}=${query.published}`,
        );
      if (query.status) conditions.push(sql`status=${query.status}`);
      if (query.scope)
        conditions.push(
          query.scope.type === "personal"
            ? sql`scope_type='personal' AND owner_user_id=${query.scope.ownerUserId}`
            : sql`scope_type='project' AND project_id=${query.scope.projectId}`,
        );
      if (query.parentId)
        conditions.push(
          kind === "runs"
            ? sql`(conversation_id=${query.parentId} OR task_id=${query.parentId})`
            : kind === "usage"
              ? sql`run_id=${query.parentId}`
              : sql`(parent_id=${query.parentId} OR secondary_parent_id=${query.parentId})`,
        );

      if (query.actorId) conditions.push(sql`actor_id=${query.actorId}`);
      if (query.idempotencyKey) conditions.push(sql`idempotency_key=${query.idempotencyKey}`);
      if (query.before)
        conditions.push(
          sql`(created_at,id)<(${query.before.createdAt.toISOString()},${query.before.id})`,
        );
      return records<CloudEntities[K]>(
        sql`SELECT data FROM ${sql.identifier(cloudRecords[kind].table)} WHERE ${sql.join(conditions, sql` AND `)} ORDER BY created_at DESC,id DESC ${query.limit ? sql`LIMIT ${query.limit}` : sql``}`,
      );
    },
    remove: async (kind, id) => {
      await db.execute(sql`DELETE FROM ${sql.identifier(cloudRecords[kind].table)} WHERE id=${id}`);
    },
    save: async (kind, entity) => {
      if (kind === "rounds") {
        const prior = await records<CloudEntities["rounds"]>(
          sql`SELECT data FROM cloud_task_rounds WHERE id=${entity.id}`,
        );
        if (prior[0]) {
          const round = entity as CloudEntities["rounds"];
          if (!sameCloudTaskRound(prior[0], round))
            throw new CloudDomainError("CLOUD_INVALID_INPUT", "Task rounds are immutable.");
        }
      }
      const record = entity as unknown as Record<string, unknown>;
      const parents = cloudParentIds(kind, entity);
      const columns: Record<string, SQL> = {
        id: sql`${entity.id}`,
        scope_type: sql`${entity.scope.type}`,
        owner_user_id: sql`${entity.scope.type === "personal" ? entity.scope.ownerUserId : null}`,
        project_id: sql`${entity.scope.type === "project" ? entity.scope.projectId : null}`,
        actor_id: sql`${cloudActorId(kind, entity)}`,
        parent_id: sql`${parents[0] ?? null}`,
        secondary_parent_id: sql`${parents[1] ?? null}`,
        idempotency_key: sql`${(kind === "runs" ? record["turnId"] : record["idempotencyKey"]) ?? null}`,
        data: sql`${JSON.stringify(entity)}::jsonb`,
        created_at: sql`${entity.createdAt.toISOString()}`,
        updated_at: sql`${entity.updatedAt.toISOString()}`,
      };
      if (kind === "runs")
        Object.assign(columns, {
          task_id: sql`${record["taskId"]}`,
          conversation_id: sql`${record["conversationId"]}`,
          status: sql`${record["status"]}`,
          dispatch_ready: sql`true`,
          owner_id: sql`${record["ownerId"]}`,
          epoch: sql`${record["epoch"]}`,
          round_id: sql`${record["roundId"]}`,
          owner_account_id: sql`${record["ownerAccountId"]}`,
          lease_expires_at: sql`${record["leaseExpiresAt"] instanceof Date ? record["leaseExpiresAt"].toISOString() : null}`,
          cancel_requested: sql`${record["cancelRequested"]}`,
        });
      if (kind === "tasks")
        Object.assign(columns, {
          status: sql`${record["status"]}`,
          current_round_id: sql`${record["currentRoundId"]}`,
          goal_version: sql`${record["goalVersion"]}`,
        });
      if (kind === "rounds")
        Object.assign(columns, {
          task_id: sql`${record["taskId"]}`,
          goal_version: sql`${record["goalVersion"]}`,
        });
      if (kind === "revisions")
        Object.assign(columns, {
          round_id: sql`${record["roundId"]}`,
          goal_version: sql`${record["goalVersion"]}`,
        });
      if (kind === "usage")
        Object.assign(columns, {
          run_id: sql`${record["runId"]}`,
          state: sql`${record["state"]}`,
          owner_account_id: sql`${record["accountId"]}`,
          round_id: sql`${record["roundId"]}`,
        });
      const entries = Object.entries(columns);
      try {
        await db.execute(
          sql`INSERT INTO ${sql.identifier(cloudRecords[kind].table)} (${sql.join(
            entries.map(([name]) => sql.identifier(name)),
            sql`,`,
          )}) VALUES (${sql.join(
            entries.map(([, value]) => value),
            sql`,`,
          )}) ON CONFLICT (id) DO UPDATE SET ${sql.join(
            entries
              .filter(([name]) => name !== "id")
              .map(([name]) => sql`${sql.identifier(name)}=${excludedColumn(name)}`),
            sql`,`,
          )}`,
        );
      } catch (error) {
        if (kind === "runs" && isUniqueViolation(error, "cloud_runs_active_task_idx"))
          throw new CloudDomainError("CLOUD_RUN_ACTIVE", "Task has an active run.");
        throw error;
      }
    },
    userActive: async (actorId) => {
      const statement = db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, actorId))
        .limit(1);
      const rows = writing ? await statement.for("share") : await statement;
      return rows[0]?.status === "active";
    },
    projectAccess: async (projectId, actorId) => {
      const query = db.select().from(v2Projects).where(eq(v2Projects.id, projectId)).limit(1);
      const projects = writing ? await query.for("share") : await query;
      const project = projects[0];
      if (!project) return null;
      const memberQuery = db
        .select()
        .from(v2ProjectMembers)
        .where(and(eq(v2ProjectMembers.projectId, projectId), eq(v2ProjectMembers.userId, actorId)))
        .limit(1);
      const members = writing ? await memberQuery.for("share") : await memberQuery;
      let organizationMember = null;
      if (project.organizationId) {
        const memberQuery = db
          .select()
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.organizationId, project.organizationId),
              eq(organizationMembers.userId, actorId),
            ),
          )
          .limit(1);
        const rows = writing ? await memberQuery.for("share") : await memberQuery;
        organizationMember = rows[0] ?? null;
      }
      return { project, projectMember: members[0] ?? null, organizationMember };
    },
    appendEvent: async (event) => {
      try {
        await db.execute(
          sql`INSERT INTO cloud_events (run_id,sequence,event_id,occurred_at,data) VALUES (${event.runId},${event.sequence},${event.eventId},${event.occurredAt.toISOString()},${JSON.stringify(event)}::jsonb)`,
        );
      } catch (error) {
        if (isUniqueViolation(error, "cloud_events_pkey"))
          throw new CloudDomainError(
            "CLOUD_IDEMPOTENCY_CONFLICT",
            "Event sequence already exists.",
          );
        throw error;
      }
    },
    events: (runId, afterSequence, limit) =>
      records<CloudRunEvent>(
        sql`SELECT data FROM cloud_events WHERE run_id=${runId} AND sequence>${afterSequence} ORDER BY sequence LIMIT ${limit}`,
      ),
    eventById: async (runId, eventId) => {
      const rows = await records<CloudRunEvent>(
        sql`SELECT data FROM cloud_events WHERE run_id=${runId} AND event_id=${eventId} LIMIT 1`,
      );
      return rows[0] ?? null;
    },
    eventsBefore: async (runId, beforeSequence, limit) => {
      const rows = await records<CloudRunEvent>(
        sql`SELECT data FROM cloud_events WHERE run_id=${runId} AND sequence<${beforeSequence} ORDER BY sequence DESC LIMIT ${limit}`,
      );
      return rows.reverse();
    },
  };
}
export class PostgresCloudRepository implements CloudRepository {
  constructor(private readonly db: Database) {}
  read<T>(operation: (tx: CloudTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => operation(txFor(tx, false)), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  }
  transaction<T>(
    keys: readonly string[],
    operation: (tx: CloudTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (db) => {
      const tx = txFor(db, true);
      await tx.lock(keys);
      return operation(tx);
    });
  }
}
