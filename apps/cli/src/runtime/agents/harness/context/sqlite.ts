import { isAbsolute } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { openProfileDatabase, type LocalDatabase } from "../../../sqlite";
import { piContexts } from "../../../sqlite/schema";
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
  private database: LocalDatabase | undefined;
  constructor(
    directory: string,
    private readonly contextId: string,
  ) {
    if (
      typeof directory !== "string" ||
      !isAbsolute(directory) ||
      typeof contextId !== "string" ||
      !contextId.trim() ||
      contextId.length > 200 ||
      contextId.includes("\0")
    )
      fail("PI_CONTEXT_INVALID");
    try {
      this.database = openProfileDatabase(directory);
    } catch {
      fail("PI_STORE_UNAVAILABLE");
    }
  }
  private open() {
    return this.database ?? fail("PI_STORE_CLOSED");
  }
  private row(database: LocalDatabase) {
    // Do not pull an oversized corrupted body into JS before rejecting it.
    const bytes = sql<number>`length(CAST(${piContexts.value} AS BLOB))`;
    return database
      .select({
        revision: piContexts.revision,
        bytes,
        value: sql<
          string | null
        >`CASE WHEN ${bytes}<=${PI_CONTEXT_MAX_BYTES} THEN ${piContexts.value} ELSE NULL END`,
      })
      .from(piContexts)
      .where(eq(piContexts.contextId, this.contextId))
      .get();
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
      return database.transaction(
        () => {
          const row = this.row(database);
          if (row) {
            this.decode(row); // Corrupted persisted state is never silently replaced.
            if (row.revision !== expectedRevision) fail("PI_STORE_CONFLICT");
            const result = database
              .update(piContexts)
              .set({ revision: expectedRevision + 1, value })
              .where(
                and(
                  eq(piContexts.contextId, this.contextId),
                  eq(piContexts.revision, expectedRevision),
                ),
              )
              .run();
            if (result.changes !== 1) fail("PI_STORE_CONFLICT");
          } else {
            if (expectedRevision !== 0) fail("PI_STORE_CONFLICT");
            database
              .insert(piContexts)
              .values({ contextId: this.contextId, revision: 1, value })
              .run();
          }
          return expectedRevision + 1;
        },
        { behavior: "immediate" },
      );
    } catch (error) {
      if (error instanceof PiContextStoreError) throw error;
      return fail("PI_STORE_UNAVAILABLE");
    }
  }
  close() {
    const database = this.database;
    this.database = undefined;
    try {
      database?.$client.close();
    } catch {
      fail("PI_STORE_UNAVAILABLE");
    }
  }
}
