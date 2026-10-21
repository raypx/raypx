import { Database } from "bun:sqlite";
import { join } from "node:path";
import type {
  AgentEvent,
  AgentProvider,
  AgentTask,
  HumanRequest,
  RelayCommand,
  SequencedEvent,
} from "@raypx/contracts/tasks";
import { LocalError } from "../errors";
import { activeTaskStatuses } from "@raypx/contracts/tasks";

export interface LocalAgentTask {
  task: AgentTask;
  binding: string;
  sessionId: string | null;
}
export class AgentStore {
  private readonly database: Database;
  readonly streamId: string;
  constructor(directory: string) {
    this.database = new Database(join(directory, "agents.sqlite"), { create: true, strict: true });
    this.database.exec(
      "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, providers TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS outbox (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, binding TEXT NOT NULL, value TEXT NOT NULL);",
    );
    this.database.exec(
      "CREATE TABLE IF NOT EXISTS journal (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, binding TEXT NOT NULL, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY,binding TEXT NOT NULL,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY,payload TEXT NOT NULL,result TEXT); CREATE TABLE IF NOT EXISTS agent_meta (id TEXT PRIMARY KEY,value TEXT NOT NULL);",
    );
    this.database
      .query("INSERT OR IGNORE INTO agent_meta VALUES ('stream',?)")
      .run(crypto.randomUUID());
    this.streamId = (
      this.database.query("SELECT value FROM agent_meta WHERE id='stream'").get() as {
        value: string;
      }
    ).value;
  }
  projects(): { id: string; providers: AgentProvider[] }[] {
    return (
      this.database.query("SELECT id,providers FROM projects ORDER BY id").all() as {
        id: string;
        providers: string;
      }[]
    ).map((row) => ({ id: row.id, providers: JSON.parse(row.providers) }));
  }
  configure(id: string, providers: AgentProvider[]) {
    this.database
      .query("INSERT OR REPLACE INTO projects VALUES (?,?)")
      .run(id, JSON.stringify(providers));
  }
  get(id: string): LocalAgentTask | undefined {
    const row = this.database.query("SELECT value FROM tasks WHERE id=?").get(id) as {
      value: string;
    } | null;
    return row ? JSON.parse(row.value) : undefined;
  }
  tasks(): LocalAgentTask[] {
    return (this.database.query("SELECT value FROM tasks").all() as { value: string }[]).map(
      (row) => JSON.parse(row.value),
    );
  }
  put(value: LocalAgentTask) {
    this.database
      .query("INSERT OR REPLACE INTO tasks VALUES (?,?)")
      .run(value.task.id, JSON.stringify(value));
  }
  accept(value: LocalAgentTask, id: string) {
    this.database.transaction(() => {
      this.receipt(id);
      this.put(value);
    })();
  }
  transition(value: LocalAgentTask, event: AgentEvent) {
    this.database.transaction(() => {
      this.put(value);
      if (!activeTaskStatuses.includes(value.task.status))
        for (const request of this.requests(value.binding))
          if (request.taskId === value.task.id && ["pending", "decided"].includes(request.status))
            this.request(value.binding, { ...request, status: "cancelled" });
      this.event(value.binding, event);
    })();
  }
  seen(id: string) {
    return Boolean(this.database.query("SELECT id FROM receipts WHERE id=?").get(id));
  }
  receipt(id: string) {
    this.database.query("INSERT OR IGNORE INTO receipts VALUES (?)").run(id);
  }
  event(binding: string, event: AgentEvent) {
    this.database.transaction(() => {
      const value = JSON.stringify(event);
      this.database
        .query("INSERT INTO outbox (id,binding,value) VALUES (?,?,?)")
        .run(event.id, binding, value);
      this.database
        .query("INSERT INTO journal (id,binding,value) VALUES (?,?,?)")
        .run(event.id, binding, value);
      this.database
        .query(
          "DELETE FROM journal WHERE binding=? AND sequence < (SELECT sequence FROM journal WHERE binding=? ORDER BY sequence DESC LIMIT 1 OFFSET 4095)",
        )
        .run(binding, binding);
    })();
  }
  sequence(binding: string) {
    return (
      this.database
        .query("SELECT COALESCE(MAX(sequence),0) AS value FROM journal WHERE binding=?")
        .get(binding) as { value: number }
    ).value;
  }
  replay(binding: string, after: number) {
    const floor = (
      this.database
        .query("SELECT COALESCE(MIN(sequence),0) AS value FROM journal WHERE binding=?")
        .get(binding) as { value: number }
    ).value;
    const rows = this.database
      .query(
        "SELECT sequence,value FROM journal WHERE binding=? AND sequence>? ORDER BY sequence LIMIT 50",
      )
      .all(binding, after) as { sequence: number; value: string }[];
    const events: SequencedEvent[] = [];
    let bytes = 0;
    for (const row of rows) {
      bytes += Buffer.byteLength(row.value);
      if (bytes > 768 * 1024) break;
      events.push({ sequence: row.sequence, event: JSON.parse(row.value) });
    }
    return { streamId: this.streamId, sequence: this.sequence(binding), floor, events };
  }
  checkpoint(binding: string, sequence: number) {
    this.database
      .query(
        "DELETE FROM outbox WHERE binding=? AND (id IN (SELECT id FROM journal WHERE binding=? AND sequence<=?) OR id NOT IN (SELECT id FROM journal WHERE binding=?))",
      )
      .run(binding, binding, sequence, binding);
  }
  requests(binding: string): HumanRequest[] {
    return (
      this.database
        .query("SELECT value FROM requests WHERE binding=? ORDER BY rowid")
        .all(binding) as { value: string }[]
    ).map((row) => JSON.parse(row.value));
  }
  request(binding: string, value: HumanRequest) {
    this.database.transaction(() => {
      this.database
        .query("INSERT OR REPLACE INTO requests VALUES (?,?,?)")
        .run(value.id, binding, JSON.stringify(value));
      this.event(binding, {
        id: crypto.randomUUID(),
        taskId: value.taskId,
        kind: "request",
        request: value,
      });
    })();
  }
  reserve(
    binding: string,
    command: RelayCommand,
  ): { ok: true; value: unknown } | { ok: false; code: string } | null {
    const payload = JSON.stringify({ binding, request: command.request });
    const old = this.database
      .query("SELECT payload,result FROM commands WHERE id=?")
      .get(command.id) as { payload: string; result: string | null } | null;
    if (old) {
      if (old.payload !== payload)
        throw new LocalError("IDEMPOTENCY_CONFLICT", "Command identity changed");
      return old.result ? JSON.parse(old.result) : null;
    }
    this.database.query("INSERT INTO commands VALUES (?,?,NULL)").run(command.id, payload);
    return null;
  }
  complete(id: string, result: { ok: true; value: unknown } | { ok: false; code: string }) {
    this.database.query("UPDATE commands SET result=? WHERE id=?").run(JSON.stringify(result), id);
  }
  events(binding: string): AgentEvent[] {
    const values = (
      this.database
        .query("SELECT value FROM outbox WHERE binding=? ORDER BY sequence LIMIT 50")
        .all(binding) as { value: string }[]
    ).map((row) => JSON.parse(row.value) as AgentEvent);
    const batch: AgentEvent[] = [];
    let bytes = 0;
    for (const value of values) {
      const size = Buffer.byteLength(JSON.stringify(value));
      if (bytes + size > 256 * 1024) break;
      bytes += size;
      batch.push(value);
    }
    return batch;
  }
  ack(binding: string, ids: string[]) {
    this.database.transaction(() => {
      for (const id of ids)
        this.database.query("DELETE FROM outbox WHERE binding=? AND id=?").run(binding, id);
    })();
  }
  close() {
    this.database.close();
  }
}
