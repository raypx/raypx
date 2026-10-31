import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { and, eq, notExists, sql } from "drizzle-orm";
import {
  terminalDecisionSchema,
  terminalRequestSchema,
  terminalSessionSchema,
  type TerminalRequest,
  type TerminalSession,
} from "@raypx/contracts/terminal";
import type { BrokerStore, DecisionReceipt } from "./broker";
import { LocalError } from "../errors";
import { drizzle, type LocalDatabase } from "../sqlite";
import {
  terminalProjects,
  terminalReceipts,
  terminalRequests,
  terminalSessions,
} from "../sqlite/schema";

export class TerminalStore implements BrokerStore {
  private readonly db: LocalDatabase;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, "terminal.sqlite");
    const database = new Database(file, { create: true, strict: true });
    this.db = drizzle({ client: database });
    chmodSync(file, 0o600);
    database.exec(`
      PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS terminal_request (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS terminal_receipt (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS terminal_session (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS terminal_project (path TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE);
    `);
    this.db
      .delete(terminalSessions)
      .where(
        notExists(
          this.db
            .select({ id: terminalRequests.id })
            .from(terminalRequests)
            .where(
              eq(
                sql`json_extract(${terminalRequests.value},'$.sessionId')`,
                sql`json_extract(${terminalSessions.value},'$.id')`,
              ),
            ),
        ),
      )
      .run();
  }
  projectId(path: string): string {
    const old = this.db
      .select({ id: terminalProjects.id })
      .from(terminalProjects)
      .where(eq(terminalProjects.path, path))
      .get();
    if (old) return old.id;
    const id = crypto.randomUUID();
    this.db.insert(terminalProjects).values({ path, id }).run();
    return id;
  }
  requests(): TerminalRequest[] {
    const rows = this.db
      .select({ value: terminalRequests.value })
      .from(terminalRequests)
      .orderBy(sql`rowid`)
      .limit(257)
      .all();
    if (rows.length > 256)
      throw new LocalError(
        "INVALID_TERMINAL_STATE",
        "Terminal prototype history exceeds its supported capacity",
      );
    return rows.map((row) => {
      try {
        return terminalRequestSchema.parse(JSON.parse(row.value));
      } catch {
        throw new LocalError("INVALID_TERMINAL_STATE", "Terminal history requires recovery");
      }
    });
  }
  receipt(id: string): DecisionReceipt | undefined {
    const row = this.db
      .select({ value: terminalReceipts.value })
      .from(terminalReceipts)
      .where(eq(terminalReceipts.id, id))
      .get();
    if (!row) return;
    try {
      const value = JSON.parse(row.value);
      return {
        input: terminalDecisionSchema.parse(value.input),
        request: terminalRequestSchema.parse(value.request),
      };
    } catch {
      throw new LocalError("INVALID_TERMINAL_STATE", "Terminal decision receipt requires recovery");
    }
  }
  save(request: TerminalRequest, receipt?: DecisionReceipt) {
    this.db.transaction(() => {
      this.db
        .insert(terminalRequests)
        .values({ id: request.id, value: JSON.stringify(request) })
        .onConflictDoUpdate({
          target: terminalRequests.id,
          set: { value: JSON.stringify(request) },
        })
        .run();
      if (receipt)
        this.db
          .insert(terminalReceipts)
          .values({ id: receipt.input.receiptId, value: JSON.stringify(receipt) })
          .run();
    });
  }
  sessions(): [string, TerminalSession][] {
    return this.db
      .select()
      .from(terminalSessions)
      .limit(1024)
      .all()
      .map((row) => [row.key, terminalSessionSchema.parse(JSON.parse(row.value))]);
  }
  session(key: string, value: TerminalSession) {
    this.db
      .insert(terminalSessions)
      .values({ key, value: JSON.stringify(value) })
      .onConflictDoUpdate({ target: terminalSessions.key, set: { value: JSON.stringify(value) } })
      .run();
  }
  remove(id: string) {
    this.db.transaction(() => {
      const row = this.db
        .select({ value: terminalRequests.value })
        .from(terminalRequests)
        .where(eq(terminalRequests.id, id))
        .get();
      this.db
        .delete(terminalReceipts)
        .where(eq(sql`json_extract(${terminalReceipts.value},'$.request.id')`, id))
        .run();
      this.db.delete(terminalRequests).where(eq(terminalRequests.id, id)).run();
      if (row)
        this.db
          .delete(terminalSessions)
          .where(
            and(
              eq(
                sql`json_extract(${terminalSessions.value},'$.id')`,
                JSON.parse(row.value).sessionId,
              ),
              notExists(
                this.db
                  .select({ id: terminalRequests.id })
                  .from(terminalRequests)
                  .where(
                    eq(
                      sql`json_extract(${terminalRequests.value},'$.sessionId')`,
                      JSON.parse(row.value).sessionId,
                    ),
                  ),
              ),
            ),
          )
          .run();
    });
  }
  close() {
    this.db.$client.close();
  }
}
