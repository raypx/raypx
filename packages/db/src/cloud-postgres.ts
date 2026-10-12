import type {
  CloudEntities,
  CloudEntityKind,
  CloudQuery,
  CloudRepository,
  CloudTransaction,
  CloudRunEvent,
} from "@voidmix/core";
import { sql, eq, and } from "drizzle-orm";
import { CloudDomainError, sameCloudTaskRound } from "@voidmix/core";
import type { Database } from "./v2/types.js";
import {
  users,
  v2Projects,
  v2ProjectMembers,
  organizationMembers,
  outboxEvents,
} from "./schema.js";
import { cloudActorId, cloudParentIds } from "./cloud-memory.js";
const tableNames: Record<CloudEntityKind, string> = {
  mutations: "cloud_mutations",
  preferences: "cloud_preferences",
  conversations: "cloud_conversations",
  turns: "cloud_turns",
  tasks: "cloud_tasks",
  rounds: "cloud_task_rounds",
  spendingGrants: "cloud_spending_grants",
  messages: "cloud_messages",
  executionGrants: "cloud_execution_grants",
  runs: "cloud_runs",
  executions: "cloud_executions",
  tools: "cloud_tools",
  sources: "cloud_sources",
  assets: "cloud_assets",
  revisions: "cloud_revisions",
  usage: "cloud_usage_calls",
  notifications: "cloud_notifications",
  commands: "cloud_commands",
};
const dates = new Set([
  "createdAt",
  "updatedAt",
  "startedAt",
  "completedAt",
  "heartbeatAt",
  "leaseExpiresAt",
  "revokedAt",
  "expiresAt",
  "settledAt",
  "readAt",
  "emailDeliveredAt",
  "verifiedAt",
  "occurredAt",
]);
function hydrate<T>(data: unknown): T {
  const restore = (value: unknown): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const record = { ...(value as Record<string, unknown>) };
    for (const field of dates) {
      const child = record[field];
      if (typeof child === "string") record[field] = new Date(child);
    }
    return record;
  };
  const record = restore(data) as Record<string, unknown>;
  // Durable mutation replay contains a domain DTO. Arbitrary tool bodies/event payloads stay JSON.
  if (record && typeof record === "object" && "response" in record) {
    const response = restore(record["response"]);
    if (response && typeof response === "object" && !Array.isArray(response)) {
      const projected = response as Record<string, unknown>;
      for (const key of ["task", "round", "run", "turn"])
        if (projected[key]) projected[key] = restore(projected[key]);
    }
    record["response"] = response;
  }
  return record as T;
}
function txFor(db: Database, writing: boolean): CloudTransaction {
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
    activeTaskRun: async (taskId) => {
      const rows = await db.execute<{ data: Record<string, unknown> }>(
        sql`SELECT data FROM cloud_runs WHERE task_id=${taskId} AND status IN ('queued','running') LIMIT 1`,
      );
      return rows[0] ? hydrate<CloudEntities["runs"]>(rows[0].data) : null;
    },
    readyRuns: async (limit) => {
      const rows = await db.execute<{ data: Record<string, unknown> }>(
        sql`SELECT data FROM cloud_runs WHERE status='queued' AND dispatch_ready=true ORDER BY created_at,id LIMIT ${limit}`,
      );
      return rows.map((row) => hydrate<CloudEntities["runs"]>(row.data));
    },
    expiredRuns: async (now, limit) => {
      const rows = await db.execute<{ data: Record<string, unknown> }>(
        sql`SELECT data FROM cloud_runs WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at<=${now.toISOString()}) ORDER BY lease_expires_at NULLS FIRST,id LIMIT ${limit}`,
      );
      return rows.map((row) => hydrate<CloudEntities["runs"]>(row.data));
    },
    get: async <K extends CloudEntityKind>(kind: K, id: string) => {
      const rows = await db.execute<{ data: Record<string, unknown> }>(
        sql`SELECT data FROM ${sql.identifier(tableNames[kind])} WHERE id=${id} LIMIT 1`,
      );
      return rows[0] ? hydrate<CloudEntities[K]>(rows[0].data) : null;
    },
    list: async <K extends CloudEntityKind>(kind: K, query: CloudQuery = {}) => {
      const conditions = [sql`true`];
      if (query.ownerAccountId)
        conditions.push(
          sql`${kind === "usage" ? sql.identifier("owner_account_id") : kind === "runs" ? sql.identifier("owner_account_id") : sql`data->>'ownerAccountId'`}=${query.ownerAccountId}`,
        );
      if (query.roundId)
        conditions.push(
          sql`${kind === "runs" || kind === "usage" ? sql.identifier("round_id") : sql`data->>'roundId'`}=${query.roundId}`,
        );
      if (query.runIds) {
        const runId = kind === "usage" ? sql.identifier("run_id") : sql`data->>'runId'`;
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
            ? sql`coalesce(data->>'sourceTurnId',data->>'turnId') IN (${sql.join(
                query.turnIds.map((id) => sql`${id}`),
                sql`,`,
              )})`
            : sql`false`,
        );
      if (query.published !== undefined)
        conditions.push(sql`(data->>'published')::boolean=${query.published}`);
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
      const rows = await db.execute<{ data: Record<string, unknown> }>(
        sql`SELECT data FROM ${sql.identifier(tableNames[kind])} WHERE ${sql.join(conditions, sql` AND `)} ORDER BY created_at DESC,id DESC ${query.limit ? sql`LIMIT ${query.limit}` : sql``}`,
      );
      return rows.map((r) => hydrate<CloudEntities[K]>(r.data));
    },
    remove: async (kind, id) => {
      await db.execute(sql`DELETE FROM ${sql.identifier(tableNames[kind])} WHERE id=${id}`);
    },
    save: async (kind, entity) => {
      if (kind === "rounds") {
        const prior = await db.execute<{ data: Record<string, unknown> }>(
          sql`SELECT data FROM cloud_task_rounds WHERE id=${entity.id}`,
        );
        if (prior[0]) {
          const stored = hydrate<CloudEntities["rounds"]>(prior[0].data);
          const round = entity as CloudEntities["rounds"];
          if (!sameCloudTaskRound(stored, round))
            throw new CloudDomainError("CLOUD_INVALID_INPUT", "Task rounds are immutable.");
        }
      }
      const record = entity as unknown as Record<string, unknown>;
      const parents = cloudParentIds(kind, entity);
      const names = [
        "id",
        "scope_type",
        "owner_user_id",
        "project_id",
        "actor_id",
        "parent_id",
        "secondary_parent_id",
        "idempotency_key",
        "data",
        "created_at",
        "updated_at",
      ];
      const values = [
        sql`${entity.id}`,
        sql`${entity.scope.type}`,
        sql`${entity.scope.type === "personal" ? entity.scope.ownerUserId : null}`,
        sql`${entity.scope.type === "project" ? entity.scope.projectId : null}`,
        sql`${cloudActorId(kind, entity)}`,
        sql`${parents[0] ?? null}`,
        sql`${parents[1] ?? null}`,
        sql`${(kind === "runs" ? record["turnId"] : record["idempotencyKey"]) ?? null}`,
        sql`${JSON.stringify(entity)}::jsonb`,
        sql`${entity.createdAt.toISOString()}`,
        sql`${entity.updatedAt.toISOString()}`,
      ];
      if (kind === "runs") {
        names.push(
          "task_id",
          "conversation_id",
          "status",
          "dispatch_ready",
          "owner_id",
          "epoch",
          "round_id",
          "owner_account_id",
          "lease_expires_at",
          "cancel_requested",
        );
        values.push(
          sql`${record["taskId"]}`,
          sql`${record["conversationId"]}`,
          sql`${record["status"]}`,
          sql`${record["dispatchReady"]}`,
          sql`${record["ownerId"]}`,
          sql`${record["epoch"]}`,
          sql`${record["roundId"]}`,
          sql`${record["ownerAccountId"]}`,
          sql`${record["leaseExpiresAt"] instanceof Date ? record["leaseExpiresAt"].toISOString() : null}`,
          sql`${record["cancelRequested"]}`,
        );
      }
      if (kind === "tasks") {
        names.push("status", "current_round_id", "goal_version");
        values.push(
          sql`${record["status"]}`,
          sql`${record["currentRoundId"]}`,
          sql`${record["goalVersion"]}`,
        );
      }
      if (kind === "rounds") {
        names.push("task_id", "goal_version");
        values.push(sql`${record["taskId"]}`, sql`${record["goalVersion"]}`);
      }
      if (kind === "revisions") {
        names.push("round_id", "goal_version");
        values.push(sql`${record["roundId"]}`, sql`${record["goalVersion"]}`);
      }
      if (kind === "usage") {
        names.push("run_id", "state", "owner_account_id", "round_id");
        values.push(
          sql`${record["runId"]}`,
          sql`${record["state"]}`,
          sql`${record["accountId"]}`,
          sql`${record["roundId"]}`,
        );
      }
      await db.execute(
        sql`INSERT INTO ${sql.identifier(tableNames[kind])} (${sql.join(
          names.map((n) => sql.identifier(n)),
          sql`,`,
        )}) VALUES (${sql.join(values, sql`,`)}) ON CONFLICT (id) DO UPDATE SET ${sql.join(
          names
            .filter((n) => n !== "id")
            .map((n) => sql`${sql.identifier(n)}=excluded.${sql.identifier(n)}`),
          sql`,`,
        )}`,
      );
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
    userProfile: async (actorId) => {
      const rows = await db
        .select({ email: users.email, displayName: users.displayName, role: users.role })
        .from(users)
        .where(eq(users.id, actorId))
        .limit(1);
      return rows[0] ?? null;
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
      await db.execute(
        sql`INSERT INTO cloud_events (run_id,sequence,event_id,occurred_at,data) VALUES (${event.runId},${event.sequence},${event.eventId},${event.occurredAt.toISOString()},${JSON.stringify(event)}::jsonb)`,
      );
    },
    events: async (runId, afterSequence, limit) => {
      const rows = await db.execute<{ data: Record<string, unknown> }>(
        sql`SELECT data FROM cloud_events WHERE run_id=${runId} AND sequence>${afterSequence} ORDER BY sequence LIMIT ${limit}`,
      );
      return rows.map((r) => hydrate<CloudRunEvent>(r.data));
    },
    eventById: async (runId, eventId) => {
      const rows = await db.execute<{ data: Record<string, unknown> }>(
        sql`SELECT data FROM cloud_events WHERE run_id=${runId} AND event_id=${eventId} LIMIT 1`,
      );
      return rows[0] ? hydrate<CloudRunEvent>(rows[0].data) : null;
    },
    eventsBefore: async (runId, beforeSequence, limit) => {
      const rows = await db.execute<{ data: Record<string, unknown> }>(
        sql`SELECT data FROM cloud_events WHERE run_id=${runId} AND sequence<${beforeSequence} ORDER BY sequence DESC LIMIT ${limit}`,
      );
      return rows.reverse().map((row) => hydrate<CloudRunEvent>(row.data));
    },
    enqueue: async (event) => {
      await db
        .insert(outboxEvents)
        .values({ ...event })
        .onConflictDoNothing();
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
