import { and, count, desc, eq, lt, sql } from "drizzle-orm";
import {
  ContextError,
  contextDocumentSchema,
  contextVersionSchema,
  type ContextDocument,
  type ContextDocumentInput,
  type ContextVersion,
} from "@raypx/memory";
import type { ContextLibraryRepository } from "@raypx/memory/server";
import { type LocalDatabase } from "../sqlite";
import { deletedDocuments, documents, versions } from "../sqlite/schema";

const summary = ({ content: _content, ...document }: ContextDocument) => document;
const inputOf = ({ kind, name, category, content, project }: ContextDocumentInput) => ({
  kind,
  name,
  category,
  content,
  project: project ? { deviceId: project.deviceId, projectId: project.projectId } : null,
});
/** Device-profile data only. Transactions fence revisions across CLI connections. */
export class SqliteContextRepository implements ContextLibraryRepository {
  constructor(
    private readonly db: LocalDatabase,
    private readonly now: () => number = Date.now,
  ) {}
  private safe<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof ContextError) throw error;
      throw new ContextError("CONTEXT_UNAVAILABLE");
    }
  }
  private storedDocument(owner: string, id: string) {
    const row = this.db
      .select({ id: documents.id, value: documents.value })
      .from(documents)
      .where(and(eq(documents.owner, owner), eq(documents.id, id)))
      .get();
    if (!row) throw new ContextError("CONTEXT_NOT_FOUND");
    const result = contextDocumentSchema.safeParse(JSON.parse(row.value));
    if (!result.success || result.data.id !== row.id) throw new ContextError("CONTEXT_UNAVAILABLE");
    return { physicalId: row.id, document: result.data };
  }
  private document(owner: string, id: string): ContextDocument {
    return this.storedDocument(owner, id).document;
  }
  private historical(owner: string, id: string, revision: number): ContextVersion {
    const row = this.db
      .select({ value: versions.value })
      .from(versions)
      .where(and(eq(versions.owner, owner), eq(versions.id, id), eq(versions.revision, revision)))
      .get();
    if (!row) throw new ContextError("CONTEXT_NOT_FOUND");
    const result = contextVersionSchema.safeParse(JSON.parse(row.value));
    if (!result.success || result.data.id !== id || result.data.revision !== revision)
      throw new ContextError("CONTEXT_UNAVAILABLE");
    return result.data;
  }
  private write(
    owner: string,
    physicalId: string,
    document: ContextDocument,
    reason: ContextVersion["reason"],
    restoredFrom?: number,
  ) {
    const parsed = contextDocumentSchema.safeParse(document);
    if (!parsed.success || parsed.data.id !== physicalId) throw new ContextError("INVALID_CONTEXT");
    const version = { ...parsed.data, reason, ...(restoredFrom ? { restoredFrom } : {}) };
    this.db
      .insert(versions)
      .values({
        owner,
        id: physicalId,
        revision: document.revision,
        value: JSON.stringify(version),
      })
      .run();
    // REPLACE allocates a new rowid, preserving the library's most-recent-write order.
    this.db.run(
      sql`INSERT OR REPLACE INTO ${documents} (${sql.identifier("owner")}, ${sql.identifier("id")}, ${sql.identifier("value")}) VALUES (${owner}, ${physicalId}, ${JSON.stringify(parsed.data)})`,
    );
    return parsed.data;
  }
  private change(
    owner: string,
    id: string,
    revision: number,
    apply: (document: ContextDocument, physicalId: string) => ContextDocument,
    reason: ContextVersion["reason"],
    restoredFrom?: number,
    unchanged?: (document: ContextDocument) => boolean,
  ) {
    return this.safe(() =>
      this.db.transaction(
        () => {
          const { document: current, physicalId } = this.storedDocument(owner, id);
          if (current.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
          if (unchanged?.(current)) return current;
          if (!Number.isSafeInteger(revision + 1)) throw new ContextError("CONTEXT_CONFLICT");
          return this.write(
            owner,
            physicalId,
            {
              ...apply(current, physicalId),
              id: current.id,
              revision: revision + 1,
              createdAt: current.createdAt,
              updatedAt: new Date(this.now()).toISOString(),
            },
            reason,
            restoredFrom,
          );
        },
        { behavior: "immediate" },
      ),
    );
  }
  async list(owner: string) {
    return this.safe(() => {
      const rows = this.db
        .select({ id: documents.id, value: documents.value })
        .from(documents)
        .where(and(eq(documents.owner, owner), eq(documents.id, sql`lower(${documents.id})`)))
        .orderBy(desc(sql`rowid`))
        .all()
        .map((row) => {
          const parsed = contextDocumentSchema.safeParse(JSON.parse(row.value));
          if (!parsed.success || parsed.data.id !== row.id)
            throw new ContextError("CONTEXT_UNAVAILABLE");
          return summary(parsed.data);
        });
      if (new Set(rows.map((row) => row.id)).size !== rows.length)
        throw new ContextError("CONTEXT_CONFLICT");
      return rows;
    });
  }
  async get(owner: string, id: string) {
    return this.safe(() => this.document(owner, id));
  }
  async version(owner: string, id: string, revision: number) {
    return this.safe(() =>
      this.historical(owner, this.storedDocument(owner, id).physicalId, revision),
    );
  }
  private creation(owner: string, requestId: string, input: ContextDocumentInput) {
    if (
      this.db
        .select({ id: deletedDocuments.id })
        .from(deletedDocuments)
        .where(eq(deletedDocuments.id, requestId))
        .get()
    )
      throw new ContextError("IDEMPOTENCY_CONFLICT");
    const rows = this.db
      .select({ owner: documents.owner, id: documents.id })
      .from(documents)
      .where(eq(sql`lower(${documents.id})`, requestId))
      .limit(2)
      .all();
    if (rows.length > 1) throw new ContextError("IDEMPOTENCY_CONFLICT");
    const existing = rows[0];
    if (!existing) return null;
    if (
      existing.owner !== owner ||
      existing.id !== requestId ||
      JSON.stringify(inputOf(this.historical(owner, existing.id, 1))) !==
        JSON.stringify(inputOf(input))
    )
      throw new ContextError("IDEMPOTENCY_CONFLICT");
    return this.document(owner, existing.id);
  }
  async findCreation(owner: string, requestId: string, input: ContextDocumentInput) {
    return this.safe(() => this.db.transaction(() => this.creation(owner, requestId, input)));
  }
  async delete(owner: string, id: string, revision: number) {
    return this.safe(() =>
      this.db.transaction(
        () => {
          const deleted = this.db
            .select({ owner: deletedDocuments.owner, revision: deletedDocuments.revision })
            .from(deletedDocuments)
            .where(eq(deletedDocuments.id, id))
            .get();
          if (deleted) {
            if (deleted.owner !== owner) throw new ContextError("CONTEXT_NOT_FOUND");
            if (deleted.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
            return { deleted: true as const };
          }
          const { document, physicalId } = this.storedDocument(owner, id);
          if (document.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
          if (!document.archived) throw new ContextError("CONTEXT_NOT_ARCHIVED");
          this.db.insert(deletedDocuments).values({ id: id, owner, revision }).run();
          this.db
            .delete(versions)
            .where(and(eq(versions.owner, owner), eq(versions.id, physicalId)))
            .run();
          this.db
            .delete(documents)
            .where(and(eq(documents.owner, owner), eq(documents.id, physicalId)))
            .run();
          return { deleted: true as const };
        },
        { behavior: "immediate" },
      ),
    );
  }
  async create(owner: string, requestId: string, input: ContextDocumentInput) {
    return this.safe(() =>
      this.db.transaction(
        () => {
          const existing = this.creation(owner, requestId, input);
          if (existing) return existing;
          const total = this.db
            .select({ count: count() })
            .from(documents)
            .where(eq(documents.owner, owner))
            .get()!.count;
          if (total >= 100) throw new ContextError("CONTEXT_LIMIT");
          const now = new Date(this.now()).toISOString();
          return this.write(
            owner,
            requestId,
            {
              ...input,
              id: requestId,
              revision: 1,
              archived: false,
              createdAt: now,
              updatedAt: now,
            },
            "created",
          );
        },
        { behavior: "immediate" },
      ),
    );
  }
  async update(owner: string, id: string, revision: number, input: ContextDocumentInput) {
    return this.change(
      owner,
      id,
      revision,
      (current) => ({ ...current, ...inputOf(input) }),
      "updated",
      undefined,
      (current) => JSON.stringify(inputOf(current)) === JSON.stringify(inputOf(input)),
    );
  }
  async archive(owner: string, id: string, revision: number, archived: boolean) {
    return this.change(
      owner,
      id,
      revision,
      (current) => ({ ...current, archived }),
      archived ? "archived" : "unarchived",
      undefined,
      (current) => current.archived === archived,
    );
  }
  async history(owner: string, id: string, before: number | undefined, limit: number) {
    return this.safe(() => {
      const { physicalId } = this.storedDocument(owner, id);
      return this.db
        .select({ revision: versions.revision })
        .from(versions)
        .where(
          and(
            eq(versions.owner, owner),
            eq(versions.id, physicalId),
            before === undefined ? undefined : lt(versions.revision, before),
          ),
        )
        .orderBy(desc(versions.revision))
        .limit(limit)
        .all()
        .map((row) => this.historical(owner, physicalId, row.revision));
    });
  }
  async restore(owner: string, id: string, revision: number, version: number) {
    return this.change(
      owner,
      id,
      revision,
      (current, physicalId) => ({
        ...current,
        ...inputOf(this.historical(owner, physicalId, version)),
      }),
      "restored",
      version,
    );
  }
  async readSources(owner: string, refs: readonly { id: string; revision: number }[]) {
    return this.safe(() =>
      this.db.transaction(() =>
        refs.map((ref) => {
          const { document, physicalId } = this.storedDocument(owner, ref.id);
          return {
            current: summary(document),
            version: this.historical(owner, physicalId, ref.revision),
          };
        }),
      ),
    );
  }
}
