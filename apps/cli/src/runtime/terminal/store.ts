import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  terminalDecisionSchema,
  terminalRequestSchema,
  terminalSessionSchema,
  type TerminalRequest,
  type TerminalSession,
} from "@raypx/contracts/terminal";
import type { BrokerStore, DecisionReceipt } from "./broker";
import { LocalError } from "../errors";

export class TerminalStore implements BrokerStore {
  private readonly db: Database;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, "terminal.sqlite");
    this.db = new Database(file, { create: true, strict: true });
    chmodSync(file, 0o600);
    this.db.exec(`
      PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS terminal_request (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS terminal_receipt (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS terminal_session (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS terminal_project (path TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE);
      DELETE FROM terminal_session WHERE NOT EXISTS (
        SELECT 1 FROM terminal_request WHERE json_extract(terminal_request.value,'$.sessionId')=json_extract(terminal_session.value,'$.id')
      );
    `);
  }
  projectId(path: string): string {
    const old = this.db.query("SELECT id FROM terminal_project WHERE path=?").get(path) as {
      id: string;
    } | null;
    if (old) return old.id;
    const id = crypto.randomUUID();
    this.db.query("INSERT INTO terminal_project(path,id) VALUES (?,?)").run(path, id);
    return id;
  }
  requests(): TerminalRequest[] {
    const rows = this.db
      .query("SELECT value FROM terminal_request ORDER BY rowid LIMIT 257")
      .all() as { value: string }[];
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
    const row = this.db.query("SELECT value FROM terminal_receipt WHERE id=?").get(id) as {
      value: string;
    } | null;
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
        .query(
          "INSERT INTO terminal_request (id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
        )
        .run(request.id, JSON.stringify(request));
      if (receipt)
        this.db
          .query("INSERT INTO terminal_receipt (id,value) VALUES (?,?)")
          .run(receipt.input.receiptId, JSON.stringify(receipt));
    })();
  }
  sessions(): [string, TerminalSession][] {
    return (
      this.db.query("SELECT key,value FROM terminal_session LIMIT 1024").all() as {
        key: string;
        value: string;
      }[]
    ).map((row) => [row.key, terminalSessionSchema.parse(JSON.parse(row.value))]);
  }
  session(key: string, value: TerminalSession) {
    this.db
      .query(
        "INSERT INTO terminal_session (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  remove(id: string) {
    this.db.transaction(() => {
      const row = this.db.query("SELECT value FROM terminal_request WHERE id=?").get(id) as {
        value: string;
      } | null;
      this.db
        .query("DELETE FROM terminal_receipt WHERE json_extract(value,'$.request.id')=?")
        .run(id);
      this.db.query("DELETE FROM terminal_request WHERE id=?").run(id);
      if (row)
        this.db
          .query(
            "DELETE FROM terminal_session WHERE json_extract(value,'$.id')=? AND NOT EXISTS(SELECT 1 FROM terminal_request WHERE json_extract(value,'$.sessionId')=?)",
          )
          .run(JSON.parse(row.value).sessionId, JSON.parse(row.value).sessionId);
    })();
  }
  close() {
    this.db.close();
  }
}
