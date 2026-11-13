import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  agents,
  conversations,
  conversationCounters as counters,
  conversationMessages as messages,
  conversationRuns as runs,
  conversationEvents as events,
  conversationRunBackupJobs as backupJobs,
  routines,
  routineIdentities,
  routineSecrets,
  routineOccurrences as occurrences,
  routineDeliveries as deliveries,
  routineEvents,
  spaceMembers,
  spaces,
} from "@raypx/database/schema";
import {
  RoutineError,
  nextRoutineDue,
  routineSchema,
  routineHistorySchema,
  routineEventSchema,
  type Routine,
  type RoutineDeliveryOutcome,
  type RoutineEvent,
} from "@raypx/core/routines";
import { normalizeTaskJson } from "@raypx/core/task-text";
import { spaceMemberSchema } from "@raypx/core/spaces";
import { resolveSpaceScope, type SpaceScope } from "@raypx/spaces/server";
import type { RoutineAdmission, RoutineFire, RoutineSecret, RoutinesRepository } from "./types.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type RoutineRow = typeof routines.$inferSelect;
function view(row: RoutineRow): Routine {
  return routineSchema.parse({
    id: row.id,
    spaceId: row.spaceId,
    agentId: row.agentId,
    ownerAccountId: row.ownerAccountId,
    name: row.name,
    prompt: row.prompt,
    enabled: row.enabled,
    triggers: row.triggers,
    emailAddress: row.emailAddress,
    nextDueAt: row.nextDueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
function outcome(row: typeof occurrences.$inferSelect): RoutineDeliveryOutcome {
  return { status: row.status, runId: row.runId, conversationId: row.conversationId };
}
const selection = (scope: SpaceScope, id: string) =>
  and(eq(routines.spaceId, scope.spaceId), eq(routines.id, id));
/** Every firing locks the routine first, then the conversation counter. All outcomes commit before dispatch. */
export function createRoutinesRepository(
  db: Database,
  options: {
    backupDelayMs?: number;
    rateLimit?: number;
    rateWindowMs?: number;
    onEvent?: (event: RoutineEvent) => void;
  } = {},
): RoutinesRepository {
  const backupDelayMs = options.backupDelayMs ?? 330_000;
  const rateLimit = options.rateLimit ?? 60;
  const rateWindowMs = options.rateWindowMs ?? 60_000;
  async function requireRoutine(
    tx: Pick<Database, "select">,
    scope: SpaceScope,
    id: string,
    lock = false,
  ) {
    const query = tx.select().from(routines).where(selection(scope, id));
    const [row] = await (lock ? query.for("update") : query);
    if (!row) throw new RoutineError("NOT_FOUND");
    return row;
  }
  async function ownerScope(tx: Pick<Database, "select">, row: RoutineRow) {
    const [member] = await tx
      .select()
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.spaceId, row.spaceId),
          eq(spaceMembers.accountId, row.ownerAccountId),
          isNull(spaceMembers.removedAt),
          sql`exists (select 1 from ${spaces} where ${spaces.id} = ${spaceMembers.spaceId} and ${spaces.deletionClaimedAt} is null)`,
        ),
      )
      .for("share");
    if (!member) throw new RoutineError("NOT_FOUND");
    return resolveSpaceScope(
      spaceMemberSchema.parse({
        spaceId: member.spaceId,
        accountId: member.accountId,
        role: member.role,
        createdAt: member.createdAt.toISOString(),
      }),
      member.accountId,
      member.spaceId as SpaceScope["spaceId"],
    );
  }
  async function admission(
    tx: Pick<Database, "select">,
    row: RoutineRow,
    editorScope?: SpaceScope,
  ): Promise<RoutineAdmission> {
    // Shared definitions remain editable after their previous owner leaves.
    // Ingress and fire still resolve the current routine owner before execution.
    const scope = editorScope ?? (await ownerScope(tx, row));
    const [secret] = await tx
      .select()
      .from(routineSecrets)
      .where(and(eq(routineSecrets.spaceId, row.spaceId), eq(routineSecrets.routineId, row.id)));
    return { scope, routine: view(row), webhookDigest: row.webhookDigest, secret: secret ?? null };
  }
  async function writeSecret(
    tx: Transaction,
    scope: SpaceScope,
    routineId: string,
    secret: RoutineSecret | null,
  ) {
    await tx
      .delete(routineSecrets)
      .where(
        and(eq(routineSecrets.spaceId, scope.spaceId), eq(routineSecrets.routineId, routineId)),
      );
    if (secret)
      await tx.insert(routineSecrets).values({ ...secret, spaceId: scope.spaceId, routineId });
  }
  async function validateAgent(tx: Pick<Database, "select">, scope: SpaceScope, agentId: string) {
    const [agent] = await tx
      .select()
      .from(agents)
      .where(
        and(eq(agents.spaceId, scope.spaceId), eq(agents.id, agentId), isNull(agents.deletedAt)),
      );
    if (!agent) throw new RoutineError("NOT_FOUND");
  }
  function emit(committed: RoutineEvent[]) {
    for (const event of committed) {
      try {
        options.onEvent?.(event);
      } catch {
        /* A committed occurrence remains committed if logging is unavailable. */
      }
    }
  }
  async function fire(
    tx: Transaction,
    row: RoutineRow,
    input: RoutineFire,
    committed: RoutineEvent[],
  ): Promise<RoutineDeliveryOutcome> {
    const scope = await ownerScope(tx, row);
    const routine = view(row);
    if (
      input.kind === "webhook" &&
      (!routine.triggers.webhook || row.webhookDigest !== input.expectedWebhookDigest)
    )
      throw new RoutineError("UNAUTHORIZED");
    if (
      input.kind === "email" &&
      (!routine.triggers.email || routine.triggers.email.allowedSender !== input.emailSender)
    )
      throw new RoutineError("UNAUTHORIZED");
    if (input.kind === "repository") {
      const [secret] = await tx
        .select()
        .from(routineSecrets)
        .where(and(eq(routineSecrets.spaceId, row.spaceId), eq(routineSecrets.routineId, row.id)));
      if (!routine.triggers.repository || !secret || secret.id !== input.expectedSecretId)
        throw new RoutineError("UNAUTHORIZED");
    }
    const automatic = input.kind !== "manual";
    const inbound = input.kind !== "manual" && input.kind !== "schedule";
    const occurrenceId = `${input.kind}:${input.id}`;
    if (inbound || input.kind === "manual") {
      const [prior] = await tx
        .select()
        .from(deliveries)
        .where(
          and(
            eq(deliveries.spaceId, row.spaceId),
            eq(deliveries.routineId, row.id),
            eq(deliveries.kind, input.kind),
            eq(deliveries.id, input.id),
          ),
        );
      if (prior) {
        if (prior.bodyDigest !== input.bodyDigest) throw new RoutineError("BODY_MISMATCH");
        const [saved] = await tx
          .select()
          .from(occurrences)
          .where(
            and(
              eq(occurrences.spaceId, row.spaceId),
              eq(occurrences.routineId, row.id),
              eq(occurrences.id, prior.occurrenceId),
            ),
          );
        if (!saved) throw new RoutineError("NOT_FOUND");
        return outcome(saved);
      }
    } else {
      const [saved] = await tx
        .select()
        .from(occurrences)
        .where(
          and(
            eq(occurrences.spaceId, row.spaceId),
            eq(occurrences.routineId, row.id),
            eq(occurrences.id, occurrenceId),
          ),
        );
      if (saved) return outcome(saved);
    }
    if (automatic && !row.enabled) throw new RoutineError("DISABLED");
    if (inbound) {
      const fresh =
        !row.rateWindowAt || input.now.getTime() - row.rateWindowAt.getTime() >= rateWindowMs;
      if (!fresh && row.rateCount >= rateLimit) throw new RoutineError("RATE_LIMITED");
      await tx
        .update(routines)
        .set({
          rateWindowAt: fresh ? input.now : row.rateWindowAt,
          rateCount: fresh ? 1 : row.rateCount + 1,
        })
        .where(selection(scope, row.id));
    }
    const filtered =
      input.kind === "repository" &&
      !routine.triggers.repository!.events.includes(input.repositoryEvent ?? "");
    let status: "fired" | "coalesced" | "ignored" = filtered ? "ignored" : "fired";
    let runId: string | null = null;
    let conversationId: string | null = null;
    let conversation: typeof conversations.$inferSelect | undefined;
    let agent: typeof agents.$inferSelect | undefined;
    let counter: typeof counters.$inferSelect | undefined;
    if (!filtered) {
      [conversation] = await tx
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.spaceId, row.spaceId),
            eq(conversations.agentId, row.agentId),
            eq(conversations.kind, "direct"),
          ),
        );
      [agent] = await tx
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.spaceId, row.spaceId),
            eq(agents.id, row.agentId),
            isNull(agents.deletedAt),
          ),
        );
      if (!conversation || !agent) throw new RoutineError("NOT_FOUND");
      conversationId = conversation.id;
      await tx
        .insert(counters)
        .values({ spaceId: row.spaceId, conversationId })
        .onConflictDoNothing();
      [counter] = await tx
        .select()
        .from(counters)
        .where(and(eq(counters.spaceId, row.spaceId), eq(counters.conversationId, conversationId)))
        .for("update");
      if (!counter) throw new RoutineError("NOT_FOUND");
    }
    if (input.kind === "schedule") {
      const [pending] = await tx
        .select({ runId: runs.id, conversationId: runs.conversationId })
        .from(occurrences)
        .innerJoin(
          runs,
          and(
            eq(runs.spaceId, occurrences.spaceId),
            eq(runs.conversationId, occurrences.conversationId),
            eq(runs.id, occurrences.runId),
          ),
        )
        .where(
          and(
            eq(occurrences.spaceId, row.spaceId),
            eq(occurrences.routineId, row.id),
            eq(occurrences.kind, "schedule"),
            eq(runs.state, "queued"),
            isNull(runs.startedAt),
          ),
        )
        .orderBy(asc(occurrences.dueAt), asc(occurrences.id))
        .limit(1);
      if (pending) {
        status = "coalesced";
        runId = pending.runId;
        conversationId = pending.conversationId;
      }
    }
    if (status === "fired") {
      if (!conversation || !agent || !counter || !conversationId)
        throw new RoutineError("NOT_FOUND");
      const messageId = crypto.randomUUID();
      runId = crypto.randomUUID();
      const sequence = counter.sequence + 1;
      const text = routine.prompt;
      // The saved prompt is the public message. Inbound content remains private to Run history and never enters event/log metadata.
      await tx.insert(messages).values({
        spaceId: row.spaceId,
        conversationId,
        id: messageId,
        sequence,
        authorAccountId: row.ownerAccountId,
        idempotencyKey: crypto.randomUUID(),
        text: normalizeTaskJson(text),
        createdAt: input.now,
      });
      const trigger = input.kind === "webhook" || input.kind === "email" ? input.kind : "routine";
      await tx.insert(runs).values({
        spaceId: row.spaceId,
        conversationId,
        id: runId,
        agentId: row.agentId,
        trigger,
        messageId,
        messageSequence: sequence,
        memberAccountId: row.ownerAccountId,
        modelId: agent.modelId,
        instructions: agent.instructions,
        state: "queued",
        createdAt: input.now,
        routineId: row.id,
        routineDueAt: input.dueAt,
        routineTimezone: routine.triggers.schedule?.timezone ?? "UTC",
        inboundProvenance:
          input.kind === "webhook" || input.kind === "email" || input.kind === "repository"
            ? { kind: input.kind, routineId: row.id, deliveryId: input.id }
            : null,
        inboundContent: inbound
          ? normalizeTaskJson(
              JSON.stringify({
                source: input.kind,
                deliveryId: input.id,
                content: input.untrustedText ?? "",
              }),
            )
          : null,
      });
      await tx.insert(events).values([
        {
          spaceId: row.spaceId,
          conversationId,
          sequence,
          kind: "message.created",
          messageId,
          createdAt: input.now,
        },
        {
          spaceId: row.spaceId,
          conversationId,
          sequence: sequence + 1,
          kind: "run.state",
          runId,
          data: { state: "queued", failureCode: null },
          createdAt: input.now,
        },
      ]);
      await tx
        .update(counters)
        .set({ sequence: sequence + 1 })
        .where(and(eq(counters.spaceId, row.spaceId), eq(counters.conversationId, conversationId)));
      await tx.insert(backupJobs).values({
        spaceId: row.spaceId,
        conversationId,
        runId,
        runAt: new Date(input.now.getTime() + backupDelayMs),
        createdAt: input.now,
      });
      await tx.execute(
        sql`select pg_notify('raypx_conversation_events', ${JSON.stringify({ conversationId, sequence: sequence + 1 })})`,
      );
    }
    await tx.insert(occurrences).values({
      spaceId: row.spaceId,
      routineId: row.id,
      id: occurrenceId,
      kind: input.kind,
      dueAt: input.dueAt,
      createdAt: input.now,
      status,
      runId,
      conversationId,
    });
    if (inbound || input.kind === "manual")
      await tx.insert(deliveries).values({
        spaceId: row.spaceId,
        routineId: row.id,
        kind: input.kind,
        id: input.id,
        bodyDigest: input.bodyDigest,
        occurrenceId,
        createdAt: input.now,
      });
    if (status !== "ignored" && runId && conversationId) {
      const event = {
        spaceId: row.spaceId,
        routineId: row.id,
        id: crypto.randomUUID(),
        kind: status === "coalesced" ? ("routine.coalesced" as const) : ("routine.fired" as const),
        occurrenceId,
        runId,
        conversationId,
        dueAt: input.dueAt,
        firedAt: input.now,
      };
      await tx.insert(routineEvents).values(event);
      committed.push(
        routineEventSchema.parse({
          ...event,
          dueAt: input.dueAt.toISOString(),
          firedAt: input.now.toISOString(),
        }),
      );
    }
    return { status, runId, conversationId };
  }
  return {
    async list(scope, agentId, limit) {
      const rows = await db
        .select()
        .from(routines)
        .where(
          and(
            eq(routines.spaceId, scope.spaceId),
            agentId ? eq(routines.agentId, agentId) : undefined,
          ),
        )
        .orderBy(desc(routines.createdAt), desc(routines.id))
        .limit(limit);
      return rows.map(view);
    },
    get: async (scope, id) => view(await requireRoutine(db, scope, id)),
    admission: async (scope, id) =>
      db.transaction(async (tx) => admission(tx, await requireRoutine(tx, scope, id), scope)),
    async ingress(selector) {
      return db.transaction(async (tx) => {
        const where =
          "id" in selector
            ? eq(routines.id, selector.id)
            : eq(routines.emailAddress, selector.address);
        const [row] = await tx.select().from(routines).where(where);
        if (!row) throw new RoutineError("NOT_FOUND");
        return admission(tx, row);
      });
    },
    async create(scope, id, input, now, values) {
      return db.transaction(async (tx) => {
        await validateAgent(tx, scope, input.agentId);
        await tx.insert(routineIdentities).values({ spaceId: scope.spaceId, id, createdAt: now });
        const [row] = await tx
          .insert(routines)
          .values({
            spaceId: scope.spaceId,
            id,
            ownerAccountId: scope.member.accountId,
            ...input,
            triggers: input.triggers,
            nextDueAt: nextRoutineDue(input.triggers, now),
            webhookDigest: values.webhookDigest,
            emailAddress: values.emailAddress,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        await writeSecret(tx, scope, id, values.secret);
        return view(row!);
      });
    },
    async update(scope, id, input, now, values) {
      return db.transaction(async (tx) => {
        const current = await requireRoutine(tx, scope, id, true);
        const [currentSecret] = await tx
          .select()
          .from(routineSecrets)
          .where(and(eq(routineSecrets.spaceId, scope.spaceId), eq(routineSecrets.routineId, id)));
        if (
          current.ownerAccountId !== values.expectedOwner ||
          current.webhookDigest !== values.expectedWebhookDigest ||
          (currentSecret?.id ?? null) !== values.expectedSecretId
        )
          throw new RoutineError("INVALID_INPUT");
        await validateAgent(tx, scope, input.agentId);
        const [row] = await tx
          .update(routines)
          .set({
            ...input,
            ownerAccountId: scope.member.accountId,
            triggers: input.triggers,
            nextDueAt: nextRoutineDue(input.triggers, now),
            webhookDigest: values.webhookDigest,
            emailAddress: values.emailAddress,
            updatedAt: now,
          })
          .where(selection(scope, id))
          .returning();
        await writeSecret(tx, scope, id, values.secret);
        return view(row!);
      });
    },
    async rotateWebhook(scope, id, digest, now, values) {
      return db.transaction(async (tx) => {
        const current = await requireRoutine(tx, scope, id, true);
        if (!view(current).triggers.webhook) throw new RoutineError("INVALID_INPUT");
        const [currentSecret] = await tx
          .select()
          .from(routineSecrets)
          .where(and(eq(routineSecrets.spaceId, scope.spaceId), eq(routineSecrets.routineId, id)));
        if (
          current.ownerAccountId !== values.expectedOwner ||
          current.webhookDigest !== values.expectedWebhookDigest ||
          (currentSecret?.id ?? null) !== values.expectedSecretId
        )
          throw new RoutineError("INVALID_INPUT");
        const [row] = await tx
          .update(routines)
          .set({ webhookDigest: digest, ownerAccountId: scope.member.accountId, updatedAt: now })
          .where(selection(scope, id))
          .returning();
        await writeSecret(tx, scope, id, values.secret);
        return view(row!);
      });
    },
    async delete(scope, id) {
      await requireRoutine(db, scope, id);
      await db.delete(routines).where(selection(scope, id));
      return { deleted: true };
    },
    async history(scope, id, limit) {
      await requireRoutine(db, scope, id);
      const rows = await db
        .select({ occurrence: occurrences, startedAt: runs.startedAt, runState: runs.state })
        .from(occurrences)
        .leftJoin(
          runs,
          and(
            eq(runs.spaceId, occurrences.spaceId),
            eq(runs.conversationId, occurrences.conversationId),
            eq(runs.id, occurrences.runId),
          ),
        )
        .where(and(eq(occurrences.spaceId, scope.spaceId), eq(occurrences.routineId, id)))
        .orderBy(desc(occurrences.createdAt), desc(occurrences.id))
        .limit(limit);
      return rows.map(({ occurrence: { spaceId: _spaceId, ...occurrence }, startedAt, runState }) =>
        routineHistorySchema.parse({
          ...occurrence,
          dueAt: occurrence.dueAt.toISOString(),
          createdAt: occurrence.createdAt.toISOString(),
          startedAt: startedAt?.toISOString() ?? null,
          delayMs: startedAt ? Math.max(0, startedAt.getTime() - occurrence.dueAt.getTime()) : null,
          runState,
        }),
      );
    },
    async events(scope, id, limit) {
      await requireRoutine(db, scope, id);
      const rows = await db
        .select()
        .from(routineEvents)
        .where(and(eq(routineEvents.spaceId, scope.spaceId), eq(routineEvents.routineId, id)))
        .orderBy(desc(routineEvents.firedAt), desc(routineEvents.id))
        .limit(limit);
      return rows.map((row) =>
        routineEventSchema.parse({
          ...row,
          dueAt: row.dueAt.toISOString(),
          firedAt: row.firedAt.toISOString(),
        }),
      );
    },
    async fire(scope, id, input) {
      const committed: RoutineEvent[] = [];
      const result = await db.transaction(async (tx) =>
        fire(tx, await requireRoutine(tx, scope, id, true), input, committed),
      );
      emit(committed);
      return result;
    },
    async scan(now, limit) {
      const committed: RoutineEvent[] = [];
      const result = await db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(routines)
          .where(and(eq(routines.enabled, true), lte(routines.nextDueAt, now)))
          .orderBy(asc(routines.nextDueAt), asc(routines.id))
          .limit(limit)
          .for("update", { skipLocked: true });
        const claims = [];
        for (const row of rows) {
          const dueAt = row.nextDueAt!;
          const scope = await ownerScope(tx, row);
          const fired = await fire(
            tx,
            row,
            {
              kind: "schedule",
              id: `${row.id}:${dueAt.toISOString()}`,
              dueAt,
              now,
              bodyDigest: "schedule",
            },
            committed,
          );
          await tx
            .update(routines)
            .set({ nextDueAt: nextRoutineDue(view(row).triggers, now) })
            .where(selection(scope, row.id));
          claims.push({ scope, outcome: fired });
        }
        return claims;
      });
      emit(committed);
      return result;
    },
  };
}
