import { Database } from "bun:sqlite";
import { chmodSync, existsSync, lstatSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { PiContext, PiContextStore } from "../providers/pi";
import { piStoredContextSchema } from "./schema";

export const PI_CONTEXT_MAX_BYTES = 8 * 1024 * 1024;
type StoreCode =
  | "PI_STORE_UNAVAILABLE"
  | "PI_STORE_CLOSED"
  | "PI_STORE_CONFLICT"
  | "PI_CONTEXT_INVALID"
  | "PI_CONTEXT_TOO_LARGE";
export class PiContextStoreError extends Error {
  constructor(readonly code: StoreCode) {
    super(code);
    this.name = "PiContextStoreError";
  }
}
type Row = { revision: number; bytes: number; value: string | null };
type RecordContext = Omit<PiContext, "revision">;
const validRevision = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
function fail(code: StoreCode): never {
  throw new PiContextStoreError(code);
}

/** Private experimental transcript storage. Callers own its path, context identity and lifetime. */
export class SqlitePiContextStore implements PiContextStore {
  private database: Database | undefined;
  constructor(
    path: string,
    private readonly contextId: string,
  ) {
    if (
      typeof path !== "string" ||
      typeof contextId !== "string" ||
      !isAbsolute(path) ||
      !contextId.trim() ||
      contextId.length > 200 ||
      contextId.includes("\0")
    )
      fail("PI_CONTEXT_INVALID");
    let database: Database | undefined;
    try {
      if (existsSync(path)) {
        const info = lstatSync(path);
        if (!info.isFile() || info.isSymbolicLink()) fail("PI_STORE_UNAVAILABLE");
      }
      database = new Database(path, { create: true, strict: true });
      // Set the database mode before SQLite creates a WAL containing transcript text.
      chmodSync(path, 0o600);
      database.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
      database.exec(
        "CREATE TABLE IF NOT EXISTS pi_contexts (context_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>0), value TEXT NOT NULL) STRICT;",
      );
      this.database = database;
    } catch (error) {
      try {
        database?.close();
      } catch {
        /* Preserve the sanitized opening error. */
      }
      if (error instanceof PiContextStoreError) throw error;
      fail("PI_STORE_UNAVAILABLE");
    }
  }
  private open() {
    return this.database ?? fail("PI_STORE_CLOSED");
  }
  private row(database: Database) {
    // Do not pull an oversized corrupted body into JS before rejecting it.
    return database
      .query(
        "SELECT revision,length(CAST(value AS BLOB)) AS bytes,CASE WHEN length(CAST(value AS BLOB))<=? THEN value ELSE NULL END AS value FROM pi_contexts WHERE context_id=?",
      )
      .get(PI_CONTEXT_MAX_BYTES, this.contextId) as Row | null;
  }
  private decode(row: Row): PiContext {
    if (!validRevision(row.revision) || row.revision < 1) fail("PI_CONTEXT_INVALID");
    if (row.bytes > PI_CONTEXT_MAX_BYTES) fail("PI_CONTEXT_TOO_LARGE");
    try {
      if (typeof row.value !== "string") fail("PI_CONTEXT_INVALID");
      const record = piStoredContextSchema.parse(JSON.parse(row.value));
      // Tool declarations persist JSON Schema; TypeBox's live symbol brand is not JSON.
      return { ...record, revision: row.revision } as PiContext;
    } catch {
      return fail("PI_CONTEXT_INVALID");
    }
  }
  private encode(context: RecordContext) {
    try {
      const record = piStoredContextSchema.parse(context);
      const value = JSON.stringify(record);
      if (Buffer.byteLength(value) > PI_CONTEXT_MAX_BYTES) fail("PI_CONTEXT_TOO_LARGE");
      return value;
    } catch (error) {
      if (error instanceof PiContextStoreError) throw error;
      return fail("PI_CONTEXT_INVALID");
    }
  }
  async load(): Promise<PiContext> {
    try {
      const row = this.row(this.open());
      return row ? this.decode(row) : { revision: 0, status: "idle", messages: [] };
    } catch (error) {
      if (error instanceof PiContextStoreError) throw error;
      return fail("PI_STORE_UNAVAILABLE");
    }
  }
  async commit(expectedRevision: number, context: RecordContext): Promise<number> {
    if (!validRevision(expectedRevision) || expectedRevision === Number.MAX_SAFE_INTEGER)
      fail("PI_CONTEXT_INVALID");
    const value = this.encode(context);
    const database = this.open();
    try {
      return database
        .transaction(() => {
          const row = this.row(database);
          if (row) {
            this.decode(row); // Corrupted persisted state is never silently replaced.
            if (row.revision !== expectedRevision) fail("PI_STORE_CONFLICT");
            const result = database
              .query("UPDATE pi_contexts SET revision=?,value=? WHERE context_id=? AND revision=?")
              .run(expectedRevision + 1, value, this.contextId, expectedRevision);
            if (result.changes !== 1) fail("PI_STORE_CONFLICT");
          } else {
            if (expectedRevision !== 0) fail("PI_STORE_CONFLICT");
            database
              .query("INSERT INTO pi_contexts(context_id,revision,value) VALUES (?,?,?)")
              .run(this.contextId, 1, value);
          }
          return expectedRevision + 1;
        })
        .immediate();
    } catch (error) {
      if (error instanceof PiContextStoreError) throw error;
      return fail("PI_STORE_UNAVAILABLE");
    }
  }
  close() {
    const database = this.database;
    this.database = undefined;
    try {
      database?.close();
    } catch {
      fail("PI_STORE_UNAVAILABLE");
    }
  }
}
