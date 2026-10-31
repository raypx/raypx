import { Database } from "bun:sqlite";
import { chmodSync } from "node:fs";
import {
  ContextError,
  contextDocumentSchema,
  contextVersionSchema,
  type ContextDocument,
  type ContextDocumentInput,
  type ContextVersion,
} from "@raypx/memory";
import type { ContextLibraryRepository } from "@raypx/memory/server";

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
  private readonly db: Database;
  constructor(
    path: string,
    private readonly now: () => number = Date.now,
  ) {
    let database: Database | undefined;
    try {
      database = new Database(path, { create: true, strict: true });
      this.db = database;
      if (process.platform !== "win32") chmodSync(path, 0o600);
      this.db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
      const version = (this.db.query("PRAGMA user_version").get() as { user_version: number })
        .user_version;
      if (version !== 0 && version !== 2) throw new ContextError("CONTEXT_UNAVAILABLE");
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS documents (owner TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(owner,id)); CREATE TABLE IF NOT EXISTS versions (owner TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(owner,id,revision)); CREATE TABLE IF NOT EXISTS deleted_documents (id TEXT PRIMARY KEY,owner TEXT NOT NULL,revision INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS documents_canonical_idx ON documents(lower(id)); PRAGMA user_version=2;",
      );
    } catch {
      database?.close();
      throw new ContextError("CONTEXT_UNAVAILABLE");
    }
  }
  private safe<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof ContextError) throw error;
      throw new ContextError("CONTEXT_UNAVAILABLE");
    }
  }
  private storedDocument(owner: string, id: string) {
    const rows = this.db
      .query("SELECT id,value FROM documents WHERE owner=? AND id=? LIMIT 1")
      .all(owner, id.toLowerCase()) as { id: string; value: string }[];
    const row = rows[0];
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
      .query("SELECT value FROM versions WHERE owner=? AND id=? AND revision=?")
      .get(owner, id, revision) as { value: string } | null;
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
      .query("INSERT INTO versions VALUES (?,?,?,?)")
      .run(owner, physicalId, document.revision, JSON.stringify(version));
    this.db
      .query("INSERT OR REPLACE INTO documents VALUES (?,?,?)")
      .run(owner, physicalId, JSON.stringify(parsed.data));
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
      this.db
        .transaction(() => {
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
        })
        .immediate(),
    );
  }
  async list(owner: string) {
    return this.safe(() => {
      const rows = (
        this.db
          .query(
            "SELECT id,value FROM documents WHERE owner=? AND id=lower(id) ORDER BY rowid DESC",
          )
          .all(owner) as { id: string; value: string }[]
      ).map((row) => {
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
    if (this.db.query("SELECT id FROM deleted_documents WHERE id=?").get(requestId.toLowerCase()))
      throw new ContextError("IDEMPOTENCY_CONFLICT");
    const rows = this.db
      .query("SELECT owner,id FROM documents WHERE lower(id)=? LIMIT 2")
      .all(requestId.toLowerCase()) as { owner: string; id: string }[];
    if (rows.length > 1) throw new ContextError("IDEMPOTENCY_CONFLICT");
    const existing = rows[0];
    if (!existing) return null;
    if (
      existing.owner !== owner ||
      existing.id !== requestId.toLowerCase() ||
      JSON.stringify(inputOf(this.historical(owner, existing.id, 1))) !==
        JSON.stringify(inputOf(input))
    )
      throw new ContextError("IDEMPOTENCY_CONFLICT");
    return this.document(owner, existing.id);
  }
  async findCreation(owner: string, requestId: string, input: ContextDocumentInput) {
    return this.safe(() => this.db.transaction(() => this.creation(owner, requestId, input))());
  }
  async delete(owner: string, id: string, revision: number) {
    return this.safe(() =>
      this.db
        .transaction(() => {
          const deleted = this.db
            .query("SELECT owner,revision FROM deleted_documents WHERE id=?")
            .get(id.toLowerCase()) as { owner: string; revision: number } | null;
          if (deleted) {
            if (deleted.owner !== owner) throw new ContextError("CONTEXT_NOT_FOUND");
            if (deleted.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
            return { deleted: true as const };
          }
          const { document, physicalId } = this.storedDocument(owner, id);
          if (document.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
          if (!document.archived) throw new ContextError("CONTEXT_NOT_ARCHIVED");
          this.db
            .query("INSERT INTO deleted_documents VALUES (?,?,?)")
            .run(id.toLowerCase(), owner, revision);
          this.db.query("DELETE FROM versions WHERE owner=? AND id=?").run(owner, physicalId);
          this.db.query("DELETE FROM documents WHERE owner=? AND id=?").run(owner, physicalId);
          return { deleted: true as const };
        })
        .immediate(),
    );
  }
  async create(owner: string, requestId: string, input: ContextDocumentInput) {
    requestId = requestId.toLowerCase();
    return this.safe(() =>
      this.db
        .transaction(() => {
          const existing = this.creation(owner, requestId, input);
          if (existing) return existing;
          const count = (
            this.db.query("SELECT count(*) AS count FROM documents WHERE owner=?").get(owner) as {
              count: number;
            }
          ).count;
          if (count >= 100) throw new ContextError("CONTEXT_LIMIT");
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
        })
        .immediate(),
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
      return (
        this.db
          .query(
            "SELECT revision FROM versions WHERE owner=? AND id=? AND (? IS NULL OR revision<?) ORDER BY revision DESC LIMIT ?",
          )
          .all(owner, physicalId, before ?? null, before ?? null, limit) as { revision: number }[]
      ).map((row) => this.historical(owner, physicalId, row.revision));
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
      )(),
    );
  }
  close() {
    this.db.close();
  }
}
