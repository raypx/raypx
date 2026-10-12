import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { ExecutionRepository, ExecutionTransaction, RunEvent } from "@voidmix/core";
import type { Database } from "./v2/types.js";
import {
  executionDevices,
  deviceProjectBindings,
  taskAgentRuns,
  runCommands,
  runEvents,
  runArtifacts,
} from "./schema/execution.js";
import { outboxEvents } from "./schema/resources.js";
const first = <T>(rows: T[]): T | null => rows[0] ?? null;
function transaction(db: Database): ExecutionTransaction {
  return {
    getDevice: async (id) =>
      first(await db.select().from(executionDevices).where(eq(executionDevices.id, id)).limit(1)),
    findDeviceByHash: async (hash) =>
      first(
        await db
          .select()
          .from(executionDevices)
          .where(eq(executionDevices.credentialHash, hash))
          .limit(1),
      ),
    listDevices: (ownerId) =>
      db.select().from(executionDevices).where(eq(executionDevices.ownerUserId, ownerId)),
    saveDevice: async (device) => {
      await db
        .insert(executionDevices)
        .values(device)
        .onConflictDoUpdate({ target: executionDevices.id, set: device });
    },
    getBinding: async (deviceId, projectId) =>
      first(
        await db
          .select()
          .from(deviceProjectBindings)
          .where(
            and(
              eq(deviceProjectBindings.deviceId, deviceId),
              eq(deviceProjectBindings.projectId, projectId),
            ),
          )
          .limit(1),
      ),
    listBindings: (deviceId) =>
      db.select().from(deviceProjectBindings).where(eq(deviceProjectBindings.deviceId, deviceId)),
    saveBinding: async (binding) => {
      await db
        .insert(deviceProjectBindings)
        .values(binding)
        .onConflictDoUpdate({
          target: [deviceProjectBindings.deviceId, deviceProjectBindings.projectId],
          set: binding,
        });
    },
    getRun: async (id) =>
      first(await db.select().from(taskAgentRuns).where(eq(taskAgentRuns.id, id)).limit(1)),
    listRuns: (projectId, taskId) =>
      db
        .select()
        .from(taskAgentRuns)
        .where(
          and(
            eq(taskAgentRuns.projectId, projectId),
            taskId ? eq(taskAgentRuns.taskId, taskId) : undefined,
          ),
        )
        .orderBy(desc(taskAgentRuns.createdAt), desc(taskAgentRuns.id)),
    listDeviceRuns: (deviceId) =>
      db
        .select()
        .from(taskAgentRuns)
        .where(eq(taskAgentRuns.targetDeviceId, deviceId))
        .orderBy(asc(taskAgentRuns.createdAt), asc(taskAgentRuns.id)),
    findRunIntent: async (actorId, key) =>
      first(
        await db
          .select()
          .from(taskAgentRuns)
          .where(
            and(
              eq(taskAgentRuns.requestedByUserId, actorId),
              eq(taskAgentRuns.idempotencyKey, key),
            ),
          )
          .limit(1),
      ),
    saveRun: async (run) => {
      await db
        .insert(taskAgentRuns)
        .values(run)
        .onConflictDoUpdate({ target: taskAgentRuns.id, set: run });
    },
    queueRun: async (run) => {
      await db.insert(taskAgentRuns).values(run);
      await db.insert(outboxEvents).values({
        id: `execution-${run.id}`,
        type: "agent.run.queued",
        payload: { runId: run.id, projectId: run.projectId, targetDeviceId: run.targetDeviceId },
        createdAt: run.createdAt,
        availableAt: run.createdAt,
      });
    },
    listEvents: async (runId, afterSeq, limit) =>
      (await db
        .select()
        .from(runEvents)
        .where(and(eq(runEvents.runId, runId), gt(runEvents.seq, afterSeq)))
        .orderBy(asc(runEvents.seq))
        .limit(limit)) as RunEvent[],
    getEvent: async (runId, seq) =>
      first(
        await db
          .select()
          .from(runEvents)
          .where(and(eq(runEvents.runId, runId), eq(runEvents.seq, seq)))
          .limit(1),
      ) as RunEvent | null,
    appendEvent: async (event) => {
      await db.insert(runEvents).values(event);
    },
    listCommands: (runId) =>
      db
        .select()
        .from(runCommands)
        .where(eq(runCommands.runId, runId))
        .orderBy(asc(runCommands.createdAt), asc(runCommands.id)),
    saveCommand: async (command) => {
      await db
        .insert(runCommands)
        .values(command)
        .onConflictDoUpdate({ target: runCommands.id, set: command });
    },
    listArtifacts: (runId) =>
      db
        .select()
        .from(runArtifacts)
        .where(eq(runArtifacts.runId, runId))
        .orderBy(asc(runArtifacts.createdAt), asc(runArtifacts.id)),
    saveArtifact: async (artifact) => {
      await db.insert(runArtifacts).values(artifact).onConflictDoNothing();
    },
  };
}
export class PostgresExecutionRepository implements ExecutionRepository {
  constructor(private readonly db: Database) {}
  read<T>(operation: (tx: ExecutionTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => operation(transaction(tx)), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  }
  transaction<T>(operation: (tx: ExecutionTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      // The execution aggregate lock linearizes claim/cancel, event/status and intent races.
      // It is independent of the administrator lock and does not expire with connectivity.
      await tx.execute(sql`select pg_advisory_xact_lock(1870034030, 2)`);
      return operation(transaction(tx));
    });
  }
}
