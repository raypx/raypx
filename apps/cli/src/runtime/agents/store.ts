import { normalizeTaskJson } from "@raypx/contracts/tasks";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type {
  AgentEvent,
  AgentProvider,
  AgentTask,
  HumanRequest,
  RelayCommand,
  SequencedEvent,
  SnapshotRecord,
  TaskActivity,
} from "@raypx/contracts/tasks";
import { LocalError } from "../errors";
import { activeTaskStatuses, taskActivitySchema, taskActivityPage } from "@raypx/contracts/tasks";
import { recordDiagnostic, type RecordDiagnostic } from "../../diagnostics";

const stored = (value: string) => normalizeTaskJson(JSON.parse(value));
const activeTasks = `json_extract(value,'$.task.status') IN (${activeTaskStatuses.map((status) => `'${status}'`).join(",")})`;
const activeActivity =
  "json_extract(value,'$.status') IN ('streaming','running','queued','sending')";
const pendingRequests = "json_extract(value,'$.status') IN ('pending','decided')";
const taskCursor = "json_extract(value,'$.task.createdAt') || ':' || id";
const forgottenCommand = (payload: string) =>
  JSON.stringify({ forgotten: createHash("sha256").update(payload).digest("hex") });
const forgottenResult = JSON.stringify({ ok: false, code: "NOT_FOUND" });
const snapshotTasksSql = `WITH recent AS (
  SELECT id FROM tasks WHERE json_extract(value,'$.binding')=?
  ORDER BY json_extract(value,'$.task.createdAt') DESC,id ASC LIMIT 100
), selected AS (
  SELECT id FROM recent UNION SELECT id FROM tasks INDEXED BY tasks_binding_active
  WHERE json_extract(value,'$.binding')=? AND ${activeTasks}
)
SELECT value FROM tasks JOIN selected USING(id)
ORDER BY json_extract(value,'$.task.createdAt') DESC,id ASC`;

type Draft<T> = T extends unknown ? Omit<T, "order" | "revision"> : never;
export type ActivityDraft = Draft<TaskActivity>;

export interface LocalAgentTask {
  task: AgentTask;
  binding: string;
  sessionId: string | null;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    cacheWriteInputTokens: number;
  };
}
export const desktopBinding = (accountId: string) => `desktop:${accountId}`;
export const isDesktopBinding = (binding: string) => binding.startsWith("desktop:");
export class AgentStore {
  private readonly database: Database;
  readonly streamId: string;
  // Relay replay keeps a rolling window per binding; tests pass a small window.
  constructor(
    directory: string,
    private readonly retained = 4096,
    private readonly retainedBytes = 8 * 1024 * 1024,
    diagnostics?: RecordDiagnostic,
  ) {
    this.database = new Database(join(directory, "agents.sqlite"), { create: true, strict: true });
    this.database.exec(
      "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, providers TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS outbox (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, binding TEXT NOT NULL, value TEXT NOT NULL);",
    );
    this.database.exec(
      "CREATE TABLE IF NOT EXISTS journal (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, binding TEXT NOT NULL, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY,binding TEXT NOT NULL,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY,payload TEXT NOT NULL,result TEXT); CREATE TABLE IF NOT EXISTS agent_meta (id TEXT PRIMARY KEY,value TEXT NOT NULL);",
    );
    this.database.exec(
      "CREATE INDEX IF NOT EXISTS journal_binding ON journal (binding,sequence); CREATE INDEX IF NOT EXISTS journal_task ON journal (binding,json_extract(value,'$.taskId'),sequence);",
    );
    this.database.exec(
      "CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY,binding TEXT NOT NULL,task_id TEXT NOT NULL,value TEXT NOT NULL); CREATE INDEX IF NOT EXISTS activity_task ON activity (binding,task_id);",
    );
    // Expression indexes upgrade existing profiles without rewriting their JSON rows.
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS tasks_binding_created ON tasks (json_extract(value,'$.binding'),json_extract(value,'$.task.createdAt') DESC,id ASC);
      CREATE INDEX IF NOT EXISTS tasks_binding_active ON tasks (json_extract(value,'$.binding'),json_extract(value,'$.task.createdAt') DESC,id ASC) WHERE ${activeTasks};
      CREATE INDEX IF NOT EXISTS tasks_binding_cursor ON tasks (json_extract(value,'$.binding'),(${taskCursor}) DESC);
      CREATE INDEX IF NOT EXISTS tasks_active_session ON tasks (json_extract(value,'$.task.provider'),json_extract(value,'$.sessionId')) WHERE ${activeTasks};
      CREATE INDEX IF NOT EXISTS requests_binding_task ON requests (binding,json_extract(value,'$.taskId'));
      CREATE INDEX IF NOT EXISTS requests_binding_pending ON requests (binding,json_extract(value,'$.expiresAt')) WHERE ${pendingRequests};
      CREATE INDEX IF NOT EXISTS activity_task_active ON activity (binding,task_id) WHERE ${activeActivity};
      CREATE INDEX IF NOT EXISTS commands_binding ON commands (json_extract(payload,'$.binding'));
    `);
    this.database
      .query("INSERT OR IGNORE INTO agent_meta VALUES ('stream',?)")
      .run(crypto.randomUUID());
    this.streamId = (
      this.database.query("SELECT value FROM agent_meta WHERE id='stream'").get() as {
        value: string;
      }
    ).value;
    // One-time, indexed legacy cleanup. Commit the marker before vacuuming;
    // a separate pending marker retries disk reclamation after a crash.
    if (!this.database.query("SELECT 1 FROM agent_meta WHERE id='local-journal-v2'").get()) {
      this.database.transaction(() => {
        this.database.exec(
          "DELETE FROM journal WHERE binding GLOB 'desktop:*' AND json_extract(value,'$.kind') IN ('activity','activity_delta'); DELETE FROM outbox WHERE id NOT IN (SELECT id FROM journal); UPDATE outbox SET value='' WHERE value!=''; INSERT OR REPLACE INTO agent_meta VALUES ('local-journal-v2','done'); INSERT OR REPLACE INTO agent_meta VALUES ('vacuum-pending','1');",
        );
      })();
    }
    if (this.database.query("SELECT 1 FROM agent_meta WHERE id='vacuum-pending'").get()) {
      try {
        this.database.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
        this.database.exec(
          "DELETE FROM agent_meta WHERE id='vacuum-pending'; PRAGMA wal_checkpoint(TRUNCATE);",
        );
      } catch {
        // Reclamation is optional, including FULL/IOERR. Keep the retry marker
        // without preventing reads or rerunning the committed row migration.
        recordDiagnostic(diagnostics, {
          operation: "agent.maintenance",
          code: "VACUUM_DEFERRED",
          outcome: "deferred",
        });
      }
    }
    for (const row of this.database
      .query("SELECT DISTINCT binding FROM journal WHERE binding NOT GLOB 'desktop:*'")
      .all() as { binding: string }[])
      this.compact(row.binding);
  }
  projects(): { id: string; providers: AgentProvider[] }[] {
    return (
      this.database.query("SELECT id,providers FROM projects ORDER BY id").all() as {
        id: string;
        providers: string;
      }[]
    ).map((row) => ({ id: row.id, providers: JSON.parse(row.providers) }));
  }
  tokenUsage(sessionId: string): LocalAgentTask["tokenUsage"] {
    const row = this.database
      .query("SELECT value FROM agent_meta WHERE id=?")
      .get(`usage:codex:${sessionId}`) as { value: string } | null;
    return row ? stored(row.value) : undefined;
  }
  recordTokenUsage(local: LocalAgentTask, totals: NonNullable<LocalAgentTask["tokenUsage"]>) {
    this.database.transaction(() => {
      local.tokenUsage = totals;
      this.put(local);
      if (local.sessionId)
        this.database
          .query("INSERT OR REPLACE INTO agent_meta VALUES (?,?)")
          .run(`usage:codex:${local.sessionId}`, JSON.stringify(totals));
    })();
  }
  deviceId(binding: string) {
    const key = `device:${binding}`;
    this.database
      .query("INSERT OR IGNORE INTO agent_meta VALUES (?,?)")
      .run(key, crypto.randomUUID());
    return (
      this.database.query("SELECT value FROM agent_meta WHERE id=?").get(key) as { value: string }
    ).value;
  }
  taskEvents(binding: string, id: string, after: number) {
    const rows = this.database
      .query(
        "SELECT sequence,value FROM journal WHERE binding=? AND sequence>? AND json_extract(value,'$.taskId')=? AND json_extract(value,'$.kind') NOT IN ('activity','activity_delta') ORDER BY sequence LIMIT 100",
      )
      .all(binding, after, id) as { sequence: number; value: string }[];
    return rows.map((row) => ({
      cursor: row.sequence,
      event: stored(row.value) as AgentEvent,
    }));
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
    return row ? stored(row.value) : undefined;
  }
  tasks(options: { binding?: string; activeOnly?: boolean } = {}): LocalAgentTask[] {
    const conditions = [
      ...(options.binding === undefined ? [] : ["json_extract(value,'$.binding')=?"]),
      ...(options.activeOnly ? [activeTasks] : []),
    ];
    return (
      this.database
        .query(
          `SELECT value FROM tasks${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""}`,
        )
        .all(...(options.binding === undefined ? [] : [options.binding])) as { value: string }[]
    ).map((row) => stored(row.value));
  }
  taskPage(binding: string, limit: number, before?: string): AgentTask[] {
    before ||= undefined;
    return (
      this.database
        .query(
          `SELECT value FROM tasks WHERE json_extract(value,'$.binding')=?${before === undefined ? "" : ` AND (${taskCursor})<?`} ORDER BY (${taskCursor}) DESC LIMIT ?`,
        )
        .all(binding, ...(before === undefined ? [] : [before]), limit) as { value: string }[]
    ).map((row) => (stored(row.value) as LocalAgentTask).task);
  }
  hasActiveSession(provider: AgentProvider, sessionId: string) {
    return Boolean(
      this.database
        .query(
          `SELECT 1 FROM tasks WHERE ${activeTasks} AND json_extract(value,'$.task.provider')=? AND json_extract(value,'$.sessionId')=? LIMIT 1`,
        )
        .get(provider, sessionId),
    );
  }
  put(value: LocalAgentTask) {
    this.database
      .query("INSERT OR REPLACE INTO tasks VALUES (?,?)")
      .run(value.task.id, JSON.stringify(normalizeTaskJson(value)));
  }
  accept(value: LocalAgentTask, id: string) {
    this.database.transaction(() => {
      this.receipt(id);
      this.put(value);
    })();
  }
  transition(
    value: LocalAgentTask,
    event: AgentEvent,
    inputCode: Extract<TaskActivity, { kind: "input" }>["code"] = "TASK_STOPPED",
  ) {
    this.database.transaction(() => {
      this.put(value);
      if (!activeTaskStatuses.includes(value.task.status)) {
        for (const request of this.requests(value.binding, value.task.id))
          if (["pending", "decided"].includes(request.status))
            this.request(value.binding, { ...request, status: "cancelled" });
        for (const entry of this.activity(value.binding, value.task.id))
          if (entry.kind === "input" && ["queued", "sending"].includes(entry.status))
            this.recordActivity(value.binding, {
              ...entry,
              status: entry.status === "sending" ? "interrupted" : "cancelled",
              code: inputCode,
              updatedAt: new Date().toISOString(),
            });
          else if (
            (entry.kind === "message" && entry.status === "streaming") ||
            (entry.kind === "tool" && entry.status === "running")
          )
            this.recordActivity(value.binding, {
              ...entry,
              status: "interrupted",
              updatedAt: new Date().toISOString(),
            });
      }
      this.event(value.binding, event);
    })();
  }
  activity(binding: string, taskId: string): TaskActivity[] {
    return (
      this.database
        .query("SELECT value FROM activity WHERE binding=? AND task_id=? ORDER BY rowid")
        .all(binding, taskId) as { value: string }[]
    ).map((row) => stored(row.value));
  }
  activityPage(binding: string, taskId: string, before?: number) {
    const rows = (
      before === undefined
        ? this.database
            .query(
              "SELECT value FROM activity WHERE binding=? AND task_id=? ORDER BY rowid DESC LIMIT 65",
            )
            .all(binding, taskId)
        : this.database
            .query(
              "SELECT value FROM activity WHERE binding=? AND task_id=? AND rowid<? ORDER BY rowid DESC LIMIT 65",
            )
            .all(binding, taskId, before)
    ) as { value: string }[];
    return taskActivityPage(
      rows.map((row) => stored(row.value) as TaskActivity),
      before,
    );
  }
  private *snapshotActivityRows(binding: string, taskId: string) {
    const seen = new Set<string>();
    for (const active of [true, false]) {
      // query() caches one cursor per SQL string; parallel task iterators need their own statements.
      const statement = this.database.prepare(
        `SELECT id,value FROM activity WHERE binding=? AND task_id=?${active ? ` AND ${activeActivity}` : ""} ORDER BY rowid DESC LIMIT 64`,
      );
      let bytes = 0;
      let count = 0;
      try {
        for (const row of statement.iterate(binding, taskId) as Iterable<{
          id: string;
          value: string;
        }>) {
          if (!active) {
            const size = Buffer.byteLength(row.value);
            if (count && bytes + size > 192 * 1024) break;
            count++;
            bytes += size;
          }
          if (!seen.has(row.id)) {
            seen.add(row.id);
            yield row;
          }
        }
      } finally {
        statement.finalize();
      }
    }
  }

  snapshot(binding: string) {
    // The first task read fixes the WAL view for rows, counts and the journal watermark.
    return this.database.transaction(() => {
      const selected = (
        this.database.query(snapshotTasksSql).all(binding, binding) as { value: string }[]
      ).map((row) => stored(row.value) as LocalAgentTask);
      const ids = JSON.stringify(selected.map((local) => local.task.id));
      const records: SnapshotRecord[] = selected.map((local) => ({
        kind: "task",
        // Reserve the completion flag before computing the byte budget (false is longer than true).
        task: { ...local.task, activityIncomplete: false },
      }));
      for (const row of this.database
        .query(
          "SELECT value FROM requests WHERE binding=? AND json_extract(value,'$.taskId') IN (SELECT value FROM json_each(?)) ORDER BY rowid",
        )
        .iterate(binding, ids) as Iterable<{ value: string }>)
        records.push({ kind: "request", request: stored(row.value) as HumanRequest });
      const totals = new Map(
        (
          this.database
            .query(
              "SELECT task_id,count(*) AS count FROM activity WHERE binding=? AND task_id IN (SELECT value FROM json_each(?)) GROUP BY task_id",
            )
            .all(binding, ids) as { task_id: string; count: number }[]
        ).map((row) => [row.task_id, row.count]),
      );
      const included = new Map<string, number>();
      let remaining = 32 * 1024 * 1024 - 64 * 1024 - Buffer.byteLength(JSON.stringify(records));
      if (remaining > 128 * 1024) {
        const pages = selected.map((local) => this.snapshotActivityRows(binding, local.task.id));
        try {
          let pending = true;
          let exhausted = false;
          while (pending && !exhausted) {
            pending = false;
            for (const page of pages) {
              const row = page.next();
              if (row.done) continue;
              pending = true;
              const size =
                Buffer.byteLength(row.value.value) +
                Buffer.byteLength(',{"kind":"activity","entry":}');
              if (size > remaining) {
                exhausted = true;
                break;
              }
              const entry = stored(row.value.value) as TaskActivity;
              records.push({ kind: "activity", entry });
              remaining -= size;
              included.set(entry.taskId, (included.get(entry.taskId) ?? 0) + 1);
            }
          }
        } finally {
          for (const page of pages) page.return();
        }
      }
      for (const record of records)
        if (record.kind === "task")
          record.task = {
            ...record.task,
            activityIncomplete:
              (included.get(record.task.id) ?? 0) < (totals.get(record.task.id) ?? 0),
          };
      return { records, sequence: this.sequence(binding) };
    })();
  }
  recordActivity(binding: string, draft: ActivityDraft): TaskActivity {
    return this.database.transaction(() => {
      const old = this.database
        .query("SELECT rowid,binding,task_id,value FROM activity WHERE id=?")
        .get(draft.id) as { rowid: number; binding: string; task_id: string; value: string } | null;
      if (old && (old.binding !== binding || old.task_id !== draft.taskId))
        throw new LocalError("IDEMPOTENCY_CONFLICT", "Activity identity changed");
      if (!old)
        this.database
          .query("INSERT INTO activity VALUES (?,?,?,?)")
          .run(draft.id, binding, draft.taskId, "{}");
      const order =
        old?.rowid ??
        (
          this.database.query("SELECT rowid FROM activity WHERE id=?").get(draft.id) as {
            rowid: number;
          }
        ).rowid;
      const previous = old ? (stored(old.value) as TaskActivity) : undefined;
      const entry = taskActivitySchema.parse(
        normalizeTaskJson({
          ...draft,
          createdAt: previous?.createdAt ?? draft.createdAt,
          order,
          revision: (previous?.revision ?? 0) + 1,
        }),
      );
      this.database
        .query("UPDATE activity SET value=? WHERE id=?")
        .run(JSON.stringify(entry), entry.id);
      if (!isDesktopBinding(binding))
        this.event(
          binding,
          previous?.kind === "message" &&
            entry.kind === "message" &&
            previous.status === "streaming" &&
            entry.status === "streaming" &&
            entry.text.startsWith(previous.text)
            ? {
                id: crypto.randomUUID(),
                taskId: entry.taskId,
                kind: "activity_delta",
                entryId: entry.id,
                baseRevision: previous.revision,
                revision: entry.revision,
                append: entry.text.slice(previous.text.length),
                updatedAt: entry.updatedAt,
                truncated: entry.truncated,
              }
            : {
                id: crypto.randomUUID(),
                taskId: entry.taskId,
                kind: "activity",
                entry,
              },
        );
      return entry;
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
      const value = JSON.stringify(normalizeTaskJson(event)),
        local = isDesktopBinding(binding);
      if (!local)
        this.database
          .query("INSERT INTO outbox (id,binding,value) VALUES (?,?,?)")
          .run(event.id, binding, "");
      this.database
        .query("INSERT INTO journal (id,binding,value) VALUES (?,?,?)")
        .run(event.id, binding, value);
      // Local history has no cloud copy; only relay replay is a rolling cache.
      if (!local) this.compact(binding);
    })();
  }
  private compact(binding: string) {
    this.database.transaction(() => {
      this.database
        .query(
          "DELETE FROM journal WHERE binding=? AND sequence IN (SELECT sequence FROM (SELECT sequence, row_number() OVER (ORDER BY sequence DESC) AS position, sum(length(CAST(value AS BLOB))) OVER (ORDER BY sequence DESC) AS bytes FROM journal WHERE binding=?) WHERE position>? OR bytes>?)",
        )
        .run(binding, binding, this.retained, this.retainedBytes);
      this.database
        .query(
          "DELETE FROM outbox WHERE binding=? AND id NOT IN (SELECT id FROM journal WHERE binding=?)",
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
      events.push({ sequence: row.sequence, event: stored(row.value) });
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
  requests(binding: string, taskId?: string): HumanRequest[] {
    return (
      this.database
        .query(
          `SELECT value FROM requests WHERE binding=?${taskId === undefined ? "" : " AND json_extract(value,'$.taskId')=?"} ORDER BY rowid`,
        )
        .all(binding, ...(taskId === undefined ? [] : [taskId])) as { value: string }[]
    ).map((row) => stored(row.value));
  }
  getRequest(binding: string, id: string): HumanRequest | undefined {
    const row = this.database
      .query("SELECT value FROM requests WHERE binding=? AND id=?")
      .get(binding, id) as { value: string } | null;
    return row ? stored(row.value) : undefined;
  }
  pendingRequests(binding: string): HumanRequest[] {
    return (
      this.database
        .query(`SELECT value FROM requests WHERE binding=? AND ${pendingRequests}
        AND EXISTS (SELECT 1 FROM tasks WHERE tasks.id=json_extract(requests.value,'$.taskId')
          AND json_extract(tasks.value,'$.binding')=requests.binding AND ${activeTasks})
        ORDER BY json_extract(value,'$.expiresAt'),rowid`)
        .all(binding) as { value: string }[]
    ).map((row) => stored(row.value));
  }
  forget(binding: string, ids: string[], pendingCommands: ReadonlySet<string> = new Set()) {
    this.database.transaction(() => {
      const removed = new Set(ids);
      // Include orphaned receipts from earlier clears. Read this binding once, before
      // deleting requests needed to associate approval decisions with their task.
      const commands = this.database
        .query("SELECT id,payload FROM commands WHERE json_extract(payload,'$.binding')=?")
        .all(binding) as { id: string; payload: string }[];
      for (const command of commands) {
        const { request } = JSON.parse(command.payload) as { request: RelayCommand["request"] };
        if (request.method === "observed.decide") continue;
        const taskId =
          request.method === "approvals.decide"
            ? this.getRequest(binding, request.input.id)?.taskId
            : request.method === "tasks.input"
              ? request.input.taskId
              : request.input.id;
        if (!taskId || !removed.has(taskId)) {
          if (pendingCommands.has(command.id)) continue;
          if (
            taskId &&
            this.database
              .query("SELECT 1 FROM tasks WHERE id=? AND json_extract(value,'$.binding')=?")
              .get(taskId, binding)
          )
            continue;
        }
        this.database
          .query("UPDATE commands SET payload=?,result=? WHERE id=?")
          .run(forgottenCommand(command.payload), forgottenResult, command.id);
      }
      for (const id of ids) {
        this.database
          .query("DELETE FROM tasks WHERE id=? AND json_extract(value,'$.binding')=?")
          .run(id, binding);
        this.database.query("DELETE FROM activity WHERE binding=? AND task_id=?").run(binding, id);
        this.database
          .query("DELETE FROM requests WHERE binding=? AND json_extract(value,'$.taskId')=?")
          .run(binding, id);
        this.database
          .query("DELETE FROM journal WHERE binding=? AND json_extract(value,'$.taskId')=?")
          .run(binding, id);
      }
    })();
  }
  request(binding: string, value: HumanRequest) {
    this.database.transaction(() => {
      this.database
        .query("INSERT OR REPLACE INTO requests VALUES (?,?,?)")
        .run(value.id, binding, JSON.stringify(normalizeTaskJson(value)));
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
    const payload = JSON.stringify({
      binding,
      request: command.request,
      ...(command.context ? { context: command.context } : {}),
    });
    const old = this.database
      .query("SELECT payload,result FROM commands WHERE id=?")
      .get(command.id) as { payload: string; result: string | null } | null;
    if (old) {
      if (old.payload !== payload && old.payload !== forgottenCommand(payload))
        throw new LocalError("IDEMPOTENCY_CONFLICT", "Command identity changed");
      return old.result ? JSON.parse(old.result) : null;
    }
    this.database.query("INSERT INTO commands VALUES (?,?,NULL)").run(command.id, payload);
    return null;
  }
  complete(id: string, result: { ok: true; value: unknown } | { ok: false; code: string }) {
    // A completion racing an explicit clear must not restore a private result.
    this.database
      .query(
        "UPDATE commands SET result=? WHERE id=? AND json_extract(payload,'$.forgotten') IS NULL",
      )
      .run(JSON.stringify(result), id);
  }
  events(binding: string): AgentEvent[] {
    const values = (
      this.database
        .query(
          "SELECT journal.value FROM outbox JOIN journal ON journal.id=outbox.id AND journal.binding=outbox.binding WHERE outbox.binding=? ORDER BY journal.sequence LIMIT 50",
        )
        .all(binding) as { value: string }[]
    ).map((row) => stored(row.value) as AgentEvent);
    const batch: AgentEvent[] = [];
    let bytes = 0;
    for (const value of values) {
      const size = Buffer.byteLength(JSON.stringify(normalizeTaskJson(value)));
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
