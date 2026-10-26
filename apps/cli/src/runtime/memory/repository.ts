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
  project,
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
      if (version > 1) throw new ContextError("CONTEXT_UNAVAILABLE");
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS documents (owner TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(owner,id)); CREATE TABLE IF NOT EXISTS versions (owner TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(owner,id,revision)); PRAGMA user_version=1;",
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
  private document(owner: string, id: string): ContextDocument {
    const row = this.db
      .query("SELECT value FROM documents WHERE owner=? AND id=?")
      .get(owner, id) as { value: string } | null;
    if (!row) throw new ContextError("CONTEXT_NOT_FOUND");
    const result = contextDocumentSchema.safeParse(JSON.parse(row.value));
    if (!result.success || result.data.id !== id) throw new ContextError("CONTEXT_UNAVAILABLE");
    return result.data;
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
    document: ContextDocument,
    reason: ContextVersion["reason"],
    restoredFrom?: number,
  ) {
    const parsed = contextDocumentSchema.safeParse(document);
    if (!parsed.success) throw new ContextError("INVALID_CONTEXT");
    const version = { ...parsed.data, reason, ...(restoredFrom ? { restoredFrom } : {}) };
    this.db
      .query("INSERT INTO versions VALUES (?,?,?,?)")
      .run(owner, document.id, document.revision, JSON.stringify(version));
    this.db
      .query("INSERT OR REPLACE INTO documents VALUES (?,?,?)")
      .run(owner, document.id, JSON.stringify(parsed.data));
    return parsed.data;
  }
  private change(
    owner: string,
    id: string,
    revision: number,
    apply: (document: ContextDocument) => ContextDocument,
    reason: ContextVersion["reason"],
    restoredFrom?: number,
    unchanged?: (document: ContextDocument) => boolean,
  ) {
    return this.safe(() =>
      this.db
        .transaction(() => {
          const current = this.document(owner, id);
          if (current.revision !== revision) throw new ContextError("CONTEXT_CONFLICT");
          if (unchanged?.(current)) return current;
          if (!Number.isSafeInteger(revision + 1)) throw new ContextError("CONTEXT_CONFLICT");
          return this.write(
            owner,
            {
              ...apply(current),
              id,
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
    return this.safe(() =>
      (
        this.db
          .query("SELECT value FROM documents WHERE owner=? ORDER BY rowid DESC")
          .all(owner) as { value: string }[]
      ).map((row) => {
        const parsed = contextDocumentSchema.safeParse(JSON.parse(row.value));
        if (!parsed.success) throw new ContextError("CONTEXT_UNAVAILABLE");
        return summary(parsed.data);
      }),
    );
  }
  async get(owner: string, id: string) {
    return this.safe(() => this.document(owner, id));
  }
  async version(owner: string, id: string, revision: number) {
    return this.safe(() => this.historical(owner, id, revision));
  }
  async create(owner: string, requestId: string, input: ContextDocumentInput) {
    return this.safe(() =>
      this.db
        .transaction(() => {
          const existing = this.db
            .query("SELECT id FROM documents WHERE owner=? AND id=?")
            .get(owner, requestId);
          if (existing) {
            if (
              JSON.stringify(inputOf(this.historical(owner, requestId, 1))) !==
              JSON.stringify(inputOf(input))
            )
              throw new ContextError("IDEMPOTENCY_CONFLICT");
            return this.document(owner, requestId);
          }
          const count = (
            this.db.query("SELECT count(*) AS count FROM documents WHERE owner=?").get(owner) as {
              count: number;
            }
          ).count;
          if (count >= 100) throw new ContextError("CONTEXT_LIMIT");
          const now = new Date(this.now()).toISOString();
          return this.write(
            owner,
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
    return this.change(owner, id, revision, (current) => ({ ...current, ...input }), "updated");
  }
  async archive(owner: string, id: string, revision: number, archived: boolean) {
    return this.change(
      owner,
      id,
      revision,
      (current) => ({ ...current, archived }),
      archived ? "archived" : "restored",
      undefined,
      (current) => current.archived === archived,
    );
  }
  async history(owner: string, id: string, before: number | undefined, limit: number) {
    return this.safe(() => {
      this.document(owner, id);
      return (
        this.db
          .query(
            "SELECT revision FROM versions WHERE owner=? AND id=? AND (? IS NULL OR revision<?) ORDER BY revision DESC LIMIT ?",
          )
          .all(owner, id, before ?? null, before ?? null, limit) as { revision: number }[]
      ).map((row) => this.historical(owner, id, row.revision));
    });
  }
  async restore(owner: string, id: string, revision: number, version: number) {
    return this.change(
      owner,
      id,
      revision,
      () => {
        const {
          reason: _reason,
          restoredFrom: _restoredFrom,
          ...document
        } = this.historical(owner, id, version);
        return document;
      },
      "restored",
      version,
    );
  }
  async readSources(owner: string, refs: readonly { id: string; revision: number }[]) {
    return this.safe(() =>
      this.db.transaction(() =>
        refs.map((ref) => ({
          current: summary(this.document(owner, ref.id)),
          version: this.historical(owner, ref.id, ref.revision),
        })),
      )(),
    );
  }
  close() {
    this.db.close();
  }
}
