import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { contextDocument, contextVersion, controlOwner } from "@raypx/database/schema";
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
async function lockedDocument(tx: Transaction, owner: string, id: string) {
  const rows = await tx.execute(sql`select id from ${contextDocument}
    where user_id=${owner} and id=${id} for update`);
  if (!rows.length) throw new ContextError("CONTEXT_NOT_FOUND");
  const [row] = await tx
    .select()
    .from(contextDocument)
    .where(and(eq(contextDocument.userId, owner), eq(contextDocument.id, id)));
  return row!;
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
  return contextVersionSchema.parse(row.body);
}
async function recordVersion(
  tx: Transaction,
  owner: string,
  document: ContextDocument,
  reason: ContextVersion["reason"],
  restoredFrom?: number,
) {
  await tx.insert(contextVersion).values({
    userId: owner,
    documentId: document.id,
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

export function createContextRepository(db: Database): ContextLibraryRepository {
  return {
    async list(owner) {
      return (
        await db
          .select(summaryColumns)
          .from(contextDocument)
          .where(eq(contextDocument.userId, owner))
          .orderBy(desc(contextDocument.updatedAt), desc(contextDocument.id))
          .limit(100)
      ).map(summaryView);
    },
    async get(owner, id) {
      const [row] = await db
        .select()
        .from(contextDocument)
        .where(and(eq(contextDocument.userId, owner), eq(contextDocument.id, id)));
      if (!row) throw new ContextError("CONTEXT_NOT_FOUND");
      return documentView(row);
    },
    version: (owner, id, revision) => selectedVersion(db, owner, id, revision),
    async create(owner, requestId, input) {
      const existing = async (tx: Database | Transaction) => {
        const [row] = await tx
          .select()
          .from(contextDocument)
          .where(eq(contextDocument.id, requestId));
        if (!row) return null;
        const saved = documentView(row);
        if (row.userId !== owner) throw new ContextError("IDEMPOTENCY_CONFLICT");
        const original = await selectedVersion(tx, owner, requestId, 1);
        if (canonical(definition(original)) !== canonical(definition(input)))
          throw new ContextError("IDEMPOTENCY_CONFLICT");
        return saved;
      };
      try {
        return await db.transaction(async (tx) => {
          await tx.insert(controlOwner).values({ userId: owner }).onConflictDoNothing();
          await tx.execute(
            sql`select user_id from ${controlOwner} where user_id=${owner} for update`,
          );
          const previous = await existing(tx);
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
          return recordVersion(tx, owner, documentView(row!), "created");
        });
      } catch (error) {
        if (!uniqueViolation(error)) throw error;
        const previous = await existing(db);
        if (!previous) throw error;
        return previous;
      }
    },
    update(owner, id, revision, input) {
      return db.transaction(async (tx) => {
        const current = await lockedDocument(tx, owner, id);
        if (current.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
        const [row] = await tx
          .update(contextDocument)
          .set({
            ...definition(input),
            revision: revision + 1,
            updatedAt: sql`now()`,
          })
          .where(and(eq(contextDocument.userId, owner), eq(contextDocument.id, id)))
          .returning();
        return recordVersion(tx, owner, documentView(row!), "updated");
      });
    },
    archive(owner, id, revision, archived) {
      return db.transaction(async (tx) => {
        const current = await lockedDocument(tx, owner, id);
        if (current.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
        if (current.archived === archived) return documentView(current);
        const [row] = await tx
          .update(contextDocument)
          .set({
            archived,
            revision: revision + 1,
            updatedAt: sql`now()`,
          })
          .where(and(eq(contextDocument.userId, owner), eq(contextDocument.id, id)))
          .returning();
        return recordVersion(tx, owner, documentView(row!), archived ? "archived" : "restored");
      });
    },
    async history(owner, id, before, limit) {
      const [owned] = await db
        .select({ id: contextDocument.id })
        .from(contextDocument)
        .where(and(eq(contextDocument.userId, owner), eq(contextDocument.id, id)));
      if (!owned) throw new ContextError("CONTEXT_NOT_FOUND");
      return (
        await db
          .select({ body: contextVersion.body })
          .from(contextVersion)
          .where(
            and(
              eq(contextVersion.userId, owner),
              eq(contextVersion.documentId, id),
              ...(before === undefined ? [] : [lt(contextVersion.revision, before)]),
            ),
          )
          .orderBy(desc(contextVersion.revision))
          .limit(Math.max(1, Math.min(limit, 20)))
      ).map((row) => contextVersionSchema.parse(row.body));
    },
    restore(owner, id, revision, version) {
      return db.transaction(async (tx) => {
        const current = await lockedDocument(tx, owner, id);
        if (current.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
        const previous = await selectedVersion(tx, owner, id, version);
        const [row] = await tx
          .update(contextDocument)
          .set({
            ...definition(previous),
            archived: previous.archived,
            revision: revision + 1,
            updatedAt: sql`now()`,
          })
          .where(and(eq(contextDocument.userId, owner), eq(contextDocument.id, id)))
          .returning();
        return recordVersion(tx, owner, documentView(row!), "restored", version);
      });
    },
    async readSources(owner, sources) {
      if (!sources.length) return [];
      // One statement sees current eligibility and immutable revisions in one MVCC snapshot.
      const rows = await db
        .select({ current: summaryColumns, version: contextVersion.body })
        .from(contextDocument)
        .innerJoin(
          contextVersion,
          and(
            eq(contextVersion.documentId, contextDocument.id),
            eq(contextVersion.userId, contextDocument.userId),
          ),
        )
        .where(
          and(
            eq(contextDocument.userId, owner),
            inArray(
              contextDocument.id,
              sources.map((source) => source.id),
            ),
            sql`(${sql.join(
              sources.map(
                (source) =>
                  sql`(${contextVersion.documentId}=${source.id} and ${contextVersion.revision}=${source.revision})`,
              ),
              sql` or `,
            )})`,
          ),
        );
      return rows.map((row) => ({
        current: summaryView(row.current),
        version: contextVersionSchema.parse(row.version),
      }));
    },
  };
}
