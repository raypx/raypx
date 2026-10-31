import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  contextDocument,
  contextVersion,
  contextDeletion,
  controlOwner,
} from "@raypx/database/schema";
import {
  ContextError,
  contextDocumentSchema,
  contextDocumentSummarySchema,
  contextVersionSchema,
  type ContextDocument,
  type ContextDocumentInput,
  type ContextVersion,
} from "@raypx/memory";
import type { ContextLibraryRepository } from "@raypx/memory/server";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DocumentRow = typeof contextDocument.$inferSelect;
const definition = (document: ContextDocumentInput): ContextDocumentInput => ({
  kind: document.kind,
  name: document.name,
  category: document.category,
  content: document.content,
  project: document.project,
});
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
const documentView = (row: DocumentRow) =>
  contextDocumentSchema.parse({
    id: row.id,
    kind: row.kind,
    name: row.name,
    category: row.category,
    content: row.content,
    project: row.project,
    revision: row.revision,
    archived: row.archived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
const summaryColumns = {
  id: contextDocument.id,
  kind: contextDocument.kind,
  name: contextDocument.name,
  category: contextDocument.category,
  project: contextDocument.project,
  revision: contextDocument.revision,
  archived: contextDocument.archived,
  createdAt: contextDocument.createdAt,
  updatedAt: contextDocument.updatedAt,
};
const summaryView = (row: Omit<DocumentRow, "userId" | "content">) =>
  contextDocumentSummarySchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
const versionView = (body: unknown, physicalId: string, revision: number) => {
  const version = contextVersionSchema.parse(body);
  if (version.id !== physicalId || version.revision !== revision)
    throw new ContextError("CONTEXT_UNAVAILABLE");
  return version;
};
async function documentRow(tx: Database | Transaction, owner: string, id: string, lock = false) {
  const query = tx
    .select()
    .from(contextDocument)
    .where(and(eq(contextDocument.userId, owner), eq(contextDocument.id, id.toLowerCase())))
    .limit(2);
  const rows = await (lock ? query.for("update") : query);
  if (!rows.length) throw new ContextError("CONTEXT_NOT_FOUND");
  if (rows.length > 1) throw new ContextError("CONTEXT_CONFLICT");
  return rows[0]!;
}
async function selectedVersion(
  tx: Database | Transaction,
  owner: string,
  id: string,
  revision: number,
) {
  const [row] = await tx
    .select({ body: contextVersion.body })
    .from(contextVersion)
    .where(
      and(
        eq(contextVersion.userId, owner),
        eq(contextVersion.documentId, id),
        eq(contextVersion.revision, revision),
      ),
    );
  if (!row) throw new ContextError("CONTEXT_NOT_FOUND");
  return versionView(row.body, id, revision);
}
async function recordVersion(
  tx: Transaction,
  owner: string,
  physicalId: string,
  document: ContextDocument,
  reason: ContextVersion["reason"],
  restoredFrom?: number,
) {
  await tx.insert(contextVersion).values({
    userId: owner,
    documentId: physicalId,
    revision: document.revision,
    body: { ...document, reason, ...(restoredFrom === undefined ? {} : { restoredFrom }) },
  });
  return document;
}
const uniqueViolation = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === "object" &&
    (("code" in error && error.code === "23505") ||
      ("cause" in error && uniqueViolation(error.cause))),
  );

async function findCreation(
  tx: Database | Transaction,
  owner: string,
  requestId: string,
  input: ContextDocumentInput,
) {
  const [deleted] = await tx
    .select({ id: contextDeletion.id })
    .from(contextDeletion)
    .where(eq(contextDeletion.id, requestId.toLowerCase()))
    .limit(1);
  if (deleted) throw new ContextError("IDEMPOTENCY_CONFLICT");
  const rows = await tx
    .select()
    .from(contextDocument)
    .where(sql`lower(${contextDocument.id})=${requestId.toLowerCase()}`)
    .limit(2);
  if (rows.length > 1) throw new ContextError("IDEMPOTENCY_CONFLICT");
  const row = rows[0];
  if (!row) return null;
  if (row.userId !== owner || row.id !== requestId.toLowerCase())
    throw new ContextError("IDEMPOTENCY_CONFLICT");
  const original = await selectedVersion(tx, owner, row.id, 1);
  if (canonical(definition(original)) !== canonical(definition(input)))
    throw new ContextError("IDEMPOTENCY_CONFLICT");
  return documentView(row);
}
async function lockIdentity(tx: Transaction, id: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`memory:${id.toLowerCase()}`},0))`,
  );
}

export function createContextRepository(db: Database): ContextLibraryRepository {
  return {
    async list(owner) {
      const rows = (
        await db
          .select(summaryColumns)
          .from(contextDocument)
          .where(
            and(
              eq(contextDocument.userId, owner),
              sql`${contextDocument.id}=lower(${contextDocument.id})`,
            ),
          )
          .orderBy(desc(contextDocument.updatedAt), desc(contextDocument.id))
          .limit(100)
      ).map(summaryView);
      if (new Set(rows.map((row) => row.id)).size !== rows.length)
        throw new ContextError("CONTEXT_CONFLICT");
      return rows;
    },
    async get(owner, id) {
      return documentView(await documentRow(db, owner, id));
    },
    async version(owner, id, revision) {
      return selectedVersion(db, owner, (await documentRow(db, owner, id)).id, revision);
    },
    findCreation: (owner, requestId, input) => findCreation(db, owner, requestId, input),
    async create(owner, requestId, input) {
      requestId = requestId.toLowerCase();
      try {
        return await db.transaction(async (tx) => {
          await lockIdentity(tx, requestId);
          await tx.insert(controlOwner).values({ userId: owner }).onConflictDoNothing();
          await tx.execute(
            sql`select user_id from ${controlOwner} where user_id=${owner} for update`,
          );
          const previous = await findCreation(tx, owner, requestId, input);
          if (previous) return previous;
          const [count] = await tx.execute<{ count: number }>(sql`select count(*)::integer as count
            from ${contextDocument} where user_id=${owner}`);
          if (count!.count >= 100) throw new ContextError("CONTEXT_LIMIT");
          const [row] = await tx
            .insert(contextDocument)
            .values({
              id: requestId,
              userId: owner,
              ...definition(input),
              revision: 1,
              archived: false,
            })
            .returning();
          return recordVersion(tx, owner, row!.id, documentView(row!), "created");
        });
      } catch (error) {
        if (!uniqueViolation(error)) throw error;
        const previous = await findCreation(db, owner, requestId, input);
        if (!previous) throw error;
        return previous;
      }
    },
    update(owner, id, revision, input) {
      return db.transaction(async (tx) => {
        const current = await documentRow(tx, owner, id, true);
        if (current.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
        if (canonical(definition(documentView(current))) === canonical(definition(input)))
          return documentView(current);
        const [row] = await tx
          .update(contextDocument)
          .set({
            ...definition(input),
            revision: revision + 1,
            updatedAt: sql`now()`,
          })
          .where(and(eq(contextDocument.userId, owner), eq(contextDocument.id, current.id)))
          .returning();
        return recordVersion(tx, owner, current.id, documentView(row!), "updated");
      });
    },
    archive(owner, id, revision, archived) {
      return db.transaction(async (tx) => {
        const current = await documentRow(tx, owner, id, true);
        if (current.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
        if (current.archived === archived) return documentView(current);
        const [row] = await tx
          .update(contextDocument)
          .set({
            archived,
            revision: revision + 1,
            updatedAt: sql`now()`,
          })
          .where(and(eq(contextDocument.userId, owner), eq(contextDocument.id, current.id)))
          .returning();
        return recordVersion(
          tx,
          owner,
          current.id,
          documentView(row!),
          archived ? "archived" : "unarchived",
        );
      });
    },
    delete(owner, id, revision) {
      return db.transaction(async (tx) => {
        await lockIdentity(tx, id);
        const [deleted] = await tx
          .select()
          .from(contextDeletion)
          .where(and(eq(contextDeletion.id, id.toLowerCase()), eq(contextDeletion.userId, owner)));
        if (deleted) {
          if (deleted.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
          return { deleted: true as const };
        }
        const current = await documentRow(tx, owner, id, true);
        if (current.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
        if (!current.archived) throw new ContextError("CONTEXT_NOT_ARCHIVED");
        await tx.insert(contextDeletion).values({ id: id.toLowerCase(), userId: owner, revision });
        await tx
          .delete(contextDocument)
          .where(and(eq(contextDocument.userId, owner), eq(contextDocument.id, current.id)));
        return { deleted: true as const };
      });
    },
    async history(owner, id, before, limit) {
      const owned = await documentRow(db, owner, id);
      return (
        await db
          .select({ body: contextVersion.body, revision: contextVersion.revision })
          .from(contextVersion)
          .where(
            and(
              eq(contextVersion.userId, owner),
              eq(contextVersion.documentId, owned.id),
              ...(before === undefined ? [] : [lt(contextVersion.revision, before)]),
            ),
          )
          .orderBy(desc(contextVersion.revision))
          .limit(Math.max(1, Math.min(limit, 20)))
      ).map((row) => versionView(row.body, owned.id, row.revision));
    },
    restore(owner, id, revision, version) {
      return db.transaction(async (tx) => {
        const current = await documentRow(tx, owner, id, true);
        if (current.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
        const previous = await selectedVersion(tx, owner, current.id, version);
        const [row] = await tx
          .update(contextDocument)
          .set({
            ...definition(previous),
            revision: revision + 1,
            updatedAt: sql`now()`,
          })
          .where(and(eq(contextDocument.userId, owner), eq(contextDocument.id, current.id)))
          .returning();
        return recordVersion(tx, owner, current.id, documentView(row!), "restored", version);
      });
    },
    async readSources(owner, sources) {
      if (!sources.length) return [];
      // One statement sees current eligibility and immutable revisions in one MVCC snapshot.
      const rows = await db
        .select({
          current: summaryColumns,
          version: contextVersion.body,
          versionRevision: contextVersion.revision,
        })
        .from(contextDocument)
        .leftJoin(
          contextVersion,
          and(
            eq(contextVersion.documentId, contextDocument.id),
            eq(contextVersion.userId, contextDocument.userId),
            sql`(${sql.join(
              sources.map(
                (source) =>
                  sql`(${contextDocument.id}=${source.id.toLowerCase()} and ${contextVersion.revision}=${source.revision})`,
              ),
              sql` or `,
            )})`,
          ),
        )
        .where(
          and(
            eq(contextDocument.userId, owner),
            inArray(
              contextDocument.id,
              sources.map((source) => source.id.toLowerCase()),
            ),
          ),
        );
      return rows.flatMap((row) =>
        row.version === null || row.versionRevision === null
          ? []
          : [
              {
                current: summaryView(row.current),
                version: versionView(row.version, row.current.id, row.versionRevision),
              },
            ],
      );
    },
  };
}
