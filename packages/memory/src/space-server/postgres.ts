import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  agents,
  spaceMembers,
  spaces,
  conversationCounters as counters,
  conversationRuns as runs,
  spaceMemoryDocuments as documents,
  spaceMemoryRevisions as revisions,
} from "@raypx/database/schema";
import { normalizeTaskJson } from "@raypx/core/task-text";
import {
  SpaceMemoryError,
  spaceMemoryDocumentSchema,
  spaceMemoryRevisionSchema,
  type SpaceMemoryDocument,
  type SpaceMemoryId,
  type SpaceMemoryInput,
} from "@raypx/core/space-memory";
import type { SpaceScope } from "@raypx/spaces/server";
import type { MemoryActor, SpaceMemoryRepository } from "./types.js";
import { MemoryExecutionFenceError } from "./types.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DocumentRow = typeof documents.$inferSelect;
function view(row: DocumentRow): SpaceMemoryDocument {
  const { authorAccountId: _authorAccountId, ...body } = row;
  return spaceMemoryDocumentSchema.parse({
    ...body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
function selector(scope: SpaceScope, id: SpaceMemoryId) {
  return and(eq(documents.spaceId, scope.spaceId), eq(documents.id, id));
}
function provenance(actor: MemoryActor) {
  return {
    kind: actor.kind,
    accountId: actor.accountId,
    runId: actor.runId ?? null,
    untrustedInput: actor.untrustedInput,
  };
}
async function requireAgent(
  tx: Transaction | Database,
  scope: SpaceScope,
  id: SpaceMemoryInput["agentId"],
) {
  if (id === null) return;
  const [row] = await tx
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.spaceId, scope.spaceId), eq(agents.id, id)));
  if (!row) throw new SpaceMemoryError("MEMORY_NOT_FOUND");
}
async function requireDocument(
  tx: Transaction | Database,
  scope: SpaceScope,
  id: SpaceMemoryId,
  lock = false,
) {
  const query = tx.select().from(documents).where(selector(scope, id));
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new SpaceMemoryError("MEMORY_NOT_FOUND");
  return row;
}
async function saveRevision(
  tx: Transaction,
  row: DocumentRow,
  reason: "created" | "edited" | "removed" | "restored",
  actor: MemoryActor,
  now: Date,
) {
  const document = view(row);
  await tx.insert(revisions).values({
    spaceId: row.spaceId,
    documentId: row.id,
    revision: row.revision,
    reason,
    body: normalizeTaskJson({ ...document, reason }),
    mutationKey: actor.mutationKey ?? null,
    createdAt: now,
  });
  return document;
}
async function replay(
  tx: Transaction,
  scope: SpaceScope,
  actor: MemoryActor,
  id: SpaceMemoryId,
  input: SpaceMemoryInput,
  revision: number,
  reason: "created" | "edited",
) {
  if (!actor.mutationKey) return undefined;
  const [row] = await tx
    .select()
    .from(revisions)
    .where(and(eq(revisions.spaceId, scope.spaceId), eq(revisions.mutationKey, actor.mutationKey)));
  if (!row) return undefined;
  const { reason: savedReason, ...document } = spaceMemoryRevisionSchema.parse(row.body);
  if (
    row.documentId !== id ||
    row.revision !== revision ||
    savedReason !== reason ||
    document.scope !== input.scope ||
    document.agentId !== input.agentId ||
    document.title !== input.title ||
    document.text !== input.text ||
    document.pinned !== input.pinned ||
    document.attribution.speaker !== input.attribution.speaker ||
    document.attribution.source !== input.attribution.source
  )
    throw new SpaceMemoryError("MEMORY_CONFLICT");
  return spaceMemoryDocumentSchema.parse(document);
}
async function assertExecution(tx: Transaction, scope: SpaceScope, actor: MemoryActor) {
  if (actor.kind !== "run") return;
  if (!actor.runId || !actor.execution) throw new MemoryExecutionFenceError();
  const { conversationId, ownerId, fence } = actor.execution;
  await tx
    .select({ sequence: counters.sequence })
    .from(counters)
    .where(and(eq(counters.spaceId, scope.spaceId), eq(counters.conversationId, conversationId)))
    .for("update");
  const [row] = await tx
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(
        eq(runs.spaceId, scope.spaceId),
        eq(runs.conversationId, conversationId),
        eq(runs.id, actor.runId),
        eq(runs.memberAccountId, actor.accountId),
        eq(runs.leaseOwner, ownerId),
        eq(runs.fence, fence),
        sql`${runs.leaseExpiresAt} > clock_timestamp()`,
        sql`exists (select 1 from ${spaceMembers} inner join ${spaces} on ${spaces.id} = ${spaceMembers.spaceId} where ${spaceMembers.spaceId} = ${scope.spaceId} and ${spaceMembers.accountId} = ${actor.accountId} and ${spaceMembers.removedAt} is null and ${spaces.deletionClaimedAt} is null)`,
        or(eq(runs.state, "running"), eq(runs.state, "waiting")),
      ),
    )
    .for("update");
  if (!row) throw new MemoryExecutionFenceError();
}
export function createSpaceMemoryRepository(db: Database): SpaceMemoryRepository {
  return {
    async list(scope, options) {
      const rows = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.spaceId, scope.spaceId),
            options.scope ? eq(documents.scope, options.scope) : undefined,
            options.agentId
              ? or(eq(documents.agentId, options.agentId), eq(documents.scope, "space"))
              : undefined,
            options.includeRemoved ? undefined : eq(documents.removed, false),
          ),
        )
        .orderBy(desc(documents.pinned), desc(documents.updatedAt), asc(documents.id))
        .limit(options.limit ?? 100);
      return rows.map(view);
    },
    async get(scope, id) {
      return view(await requireDocument(db, scope, id));
    },
    async create(scope, id, input, actor, now) {
      return db.transaction(async (tx) => {
        await assertExecution(tx, scope, actor);
        // Serialize quota and tool retries per Space, without mutating construction.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${scope.spaceId}, 48301))`,
        );
        const repeated = await replay(tx, scope, actor, id, normalizeTaskJson(input), 1, "created");
        if (repeated) return repeated;
        await requireAgent(tx, scope, input.agentId);
        const [count] = await tx
          .select({ value: sql<number>`count(*)::integer` })
          .from(documents)
          .where(eq(documents.spaceId, scope.spaceId));
        if ((count?.value ?? 0) >= 1_000) throw new SpaceMemoryError("MEMORY_LIMIT");
        const [row] = await tx
          .insert(documents)
          .values({
            ...normalizeTaskJson(input),
            spaceId: scope.spaceId,
            id,
            authorAccountId: actor.accountId,
            provenance: provenance(actor),
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return saveRevision(tx, row!, "created", actor, now);
      });
    },
    async update(scope, id, expectedRevision, input, actor, now) {
      return db.transaction(async (tx) => {
        await assertExecution(tx, scope, actor);
        const current = await requireDocument(tx, scope, id, true);
        const repeated = await replay(
          tx,
          scope,
          actor,
          id,
          normalizeTaskJson(input),
          expectedRevision + 1,
          "edited",
        );
        if (repeated) return repeated;
        if (current.revision !== expectedRevision) throw new SpaceMemoryError("MEMORY_CONFLICT");
        await requireAgent(tx, scope, input.agentId);
        const [row] = await tx
          .update(documents)
          .set({
            ...normalizeTaskJson(input),
            revision: current.revision + 1,
            removed: false,
            provenance: provenance(actor),
            authorAccountId: actor.accountId,
            updatedAt: now,
          })
          .where(selector(scope, id))
          .returning();
        return saveRevision(tx, row!, "edited", actor, now);
      });
    },
    async remove(scope, id, expectedRevision, actor, now) {
      return db.transaction(async (tx) => {
        const current = await requireDocument(tx, scope, id, true);
        if (current.revision !== expectedRevision) throw new SpaceMemoryError("MEMORY_CONFLICT");
        const [row] = await tx
          .update(documents)
          .set({
            text: null,
            removed: true,
            revision: current.revision + 1,
            provenance: provenance(actor),
            authorAccountId: actor.accountId,
            updatedAt: now,
          })
          .where(selector(scope, id))
          .returning();
        return saveRevision(tx, row!, "removed", actor, now);
      });
    },
    async history(scope, id, limit) {
      await requireDocument(db, scope, id);
      const rows = await db
        .select()
        .from(revisions)
        .where(and(eq(revisions.spaceId, scope.spaceId), eq(revisions.documentId, id)))
        .orderBy(desc(revisions.revision))
        .limit(limit);
      return rows.map((row) => spaceMemoryRevisionSchema.parse(row.body));
    },
    async restore(scope, id, expectedRevision, revision, actor, now) {
      return db.transaction(async (tx) => {
        const current = await requireDocument(tx, scope, id, true);
        if (current.revision !== expectedRevision) throw new SpaceMemoryError("MEMORY_CONFLICT");
        const [saved] = await tx
          .select()
          .from(revisions)
          .where(
            and(
              eq(revisions.spaceId, scope.spaceId),
              eq(revisions.documentId, id),
              eq(revisions.revision, revision),
            ),
          );
        if (!saved) throw new SpaceMemoryError("MEMORY_NOT_FOUND");
        const source = spaceMemoryRevisionSchema.parse(saved.body);
        await requireAgent(tx, scope, source.agentId);
        const [row] = await tx
          .update(documents)
          .set({
            scope: source.scope,
            agentId: source.agentId,
            title: source.title,
            text: source.text,
            pinned: source.pinned,
            attribution: source.attribution,
            removed: source.removed,
            provenance: source.provenance,
            authorAccountId: actor.accountId,
            revision: current.revision + 1,
            updatedAt: now,
          })
          .where(selector(scope, id))
          .returning();
        return saveRevision(tx, row!, "restored", actor, now);
      });
    },
    async recallCandidates(scope, agentId) {
      await requireAgent(db, scope, agentId);
      const rows = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.spaceId, scope.spaceId),
            eq(documents.removed, false),
            or(
              eq(documents.agentId, agentId),
              and(eq(documents.scope, "space"), isNull(documents.agentId)),
            ),
          ),
        )
        .orderBy(desc(documents.pinned), desc(documents.updatedAt), asc(documents.id));
      return rows.map(view);
    },
  };
}
