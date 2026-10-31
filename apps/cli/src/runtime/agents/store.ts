import { normalizeTaskJson } from "@raypx/core/task-text";
import { createHash } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { RelayCommand, SequencedEvent, SnapshotRecord } from "@raypx/contracts/tasks";
import type {
  AgentEvent,
  AgentProvider,
  AgentTask,
  HumanRequest,
  TaskActivity,
} from "@raypx/core/tasks";
import { LocalError } from "../errors";

import { activeTaskStatuses, taskActivitySchema } from "@raypx/core/tasks";
import { taskActivityPage } from "@raypx/core/activity";
import { iterateRows, openProfileDatabase, type LocalDatabase } from "../sqlite";
import {
  activity,
  agentMeta,
  commands,
  journal,
  outbox,
  projects,
  receipts,
  requests,
  tasks,
} from "../sqlite/schema";

const stored = (value: string) => normalizeTaskJson(JSON.parse(value));
const taskBinding = sql<string>`json_extract(${tasks.value},'$.binding')`;
const taskCreatedAt = sql<string>`json_extract(${tasks.value},'$.task.createdAt')`;
const taskPageCursor = sql<string>`${taskCreatedAt} || ':' || ${tasks.id}`;
const activeTaskFilter = sql`json_extract(${tasks.value},'$.task.status') IN (${sql.raw(activeTaskStatuses.map((status) => `'${status}'`).join(","))})`;
const activeActivityFilter = sql`json_extract(${activity.value},'$.status') IN ('streaming','running','queued','sending')`;
const pendingRequestFilter = sql`json_extract(${requests.value},'$.status') IN ('pending','decided')`;
const requestTaskId = sql<string>`json_extract(${requests.value},'$.taskId')`;
const journalTaskId = sql<string>`json_extract(${journal.value},'$.taskId')`;
const forgottenCommand = (payload: string) =>
  JSON.stringify({ forgotten: createHash("sha256").update(payload).digest("hex") });
const forgottenResult = JSON.stringify({ ok: false, code: "NOT_FOUND" });

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
  private readonly database: LocalDatabase;
  readonly streamId: string;
  // Relay replay keeps a rolling window per binding; tests pass a small window.
  constructor(
    directory: string,
    private readonly retained = 4096,
    private readonly retainedBytes = 8 * 1024 * 1024,
  ) {
    this.database = openProfileDatabase(directory);
    try {
      this.database
        .insert(agentMeta)
        .values({ id: "stream", value: crypto.randomUUID() })
        .onConflictDoNothing()
        .run();
      this.streamId = this.database
        .select({ value: agentMeta.value })
        .from(agentMeta)
        .where(eq(agentMeta.id, "stream"))
        .get()!.value;
      for (const row of this.database
        .selectDistinct({ binding: journal.binding })
        .from(journal)
        .where(sql`${journal.binding} NOT GLOB 'desktop:*'`)
        .all())
        this.compact(row.binding);
    } catch (error) {
      this.database.$client.close();
      throw error;
    }
  }

  projects(): { id: string; providers: AgentProvider[] }[] {
    return this.database
      .select()
      .from(projects)
      .orderBy(projects.id)
      .all()
      .map((row) => ({ id: row.id, providers: JSON.parse(row.providers) }));
  }
  tokenUsage(sessionId: string): LocalAgentTask["tokenUsage"] {
    const row = this.database
      .select({ value: agentMeta.value })
      .from(agentMeta)
      .where(eq(agentMeta.id, `usage:codex:${sessionId}`))
      .get();
    return row ? stored(row.value) : undefined;
  }
  recordTokenUsage(local: LocalAgentTask, totals: NonNullable<LocalAgentTask["tokenUsage"]>) {
    this.database.transaction(() => {
      local.tokenUsage = totals;
      this.put(local);
      if (local.sessionId)
        this.database
          .insert(agentMeta)
          .values({ id: `usage:codex:${local.sessionId}`, value: JSON.stringify(totals) })
          .onConflictDoUpdate({ target: agentMeta.id, set: { value: JSON.stringify(totals) } })
          .run();
    });
  }
  deviceId(binding: string) {
    const key = `device:${binding}`;
    this.database
      .insert(agentMeta)
      .values({ id: key, value: crypto.randomUUID() })
      .onConflictDoNothing()
      .run();
    return this.database
      .select({ value: agentMeta.value })
      .from(agentMeta)
      .where(eq(agentMeta.id, key))
      .get()!.value;
  }
  taskEvents(binding: string, id: string, after: number) {
    const rows = this.database
      .select({ sequence: journal.sequence, value: journal.value })
      .from(journal)
      .where(
        and(
          eq(journal.binding, binding),
          gt(journal.sequence, after),
          eq(journalTaskId, id),
          notInArray(sql`json_extract(${journal.value},'$.kind')`, ["activity", "activity_delta"]),
        ),
      )
      .orderBy(journal.sequence)
      .limit(100)
      .all();
    return rows.map((row) => ({
      cursor: row.sequence,
      event: stored(row.value) as AgentEvent,
    }));
  }
  configure(id: string, providers: AgentProvider[]) {
    this.database
      .insert(projects)
      .values({ id, providers: JSON.stringify(providers) })
      .onConflictDoUpdate({ target: projects.id, set: { providers: JSON.stringify(providers) } })
      .run();
  }
  get(id: string): LocalAgentTask | undefined {
    const row = this.database
      .select({ value: tasks.value })
      .from(tasks)
      .where(eq(tasks.id, id))
      .get();
    return row ? stored(row.value) : undefined;
  }
  tasks(options: { binding?: string; activeOnly?: boolean } = {}): LocalAgentTask[] {
    return this.database
      .select({ value: tasks.value })
      .from(tasks)
      .where(
        and(
          options.binding === undefined ? undefined : eq(taskBinding, options.binding),
          options.activeOnly ? activeTaskFilter : undefined,
        ),
      )
      .all()
      .map((row) => stored(row.value));
  }
  taskPage(binding: string, limit: number, before?: string): AgentTask[] {
    before ||= undefined;
    return this.database
      .select({ value: tasks.value })
      .from(tasks)
      .where(
        and(
          eq(taskBinding, binding),
          before === undefined ? undefined : lt(taskPageCursor, before),
        ),
      )
      .orderBy(desc(taskPageCursor))
      .limit(limit)
      .all()
      .map((row) => (stored(row.value) as LocalAgentTask).task);
  }
  hasActiveSession(provider: AgentProvider, sessionId: string) {
    return Boolean(
      this.database
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            activeTaskFilter,
            eq(sql`json_extract(${tasks.value},'$.task.provider')`, provider),
            eq(sql`json_extract(${tasks.value},'$.sessionId')`, sessionId),
          ),
        )
        .limit(1)
        .get(),
    );
  }
  put(value: LocalAgentTask) {
    // Preserve REPLACE's rowid semantics for callers enumerating task records.
    this.database.run(
      sql`INSERT OR REPLACE INTO ${tasks} (id,value) VALUES (${value.task.id},${JSON.stringify(normalizeTaskJson(value))})`,
    );
  }
  accept(value: LocalAgentTask, id: string) {
    this.database.transaction(() => {
      this.receipt(id);
      this.put(value);
    });
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
    });
  }
  activity(binding: string, taskId: string): TaskActivity[] {
    return this.database
      .select({ value: activity.value })
      .from(activity)
      .where(and(eq(activity.binding, binding), eq(activity.taskId, taskId)))
      .orderBy(sql`rowid`)
      .all()
      .map((row) => stored(row.value));
  }
  activityPage(binding: string, taskId: string, before?: number) {
    const rows = this.database
      .select({ value: activity.value })
      .from(activity)
      .where(
        and(
          eq(activity.binding, binding),
          eq(activity.taskId, taskId),
          before === undefined ? undefined : lt(sql`rowid`, before),
        ),
      )
      .orderBy(desc(sql`rowid`))
      .limit(65)
      .all();
    return taskActivityPage(
      rows.map((row) => stored(row.value) as TaskActivity),
      before,
    );
  }
  private *snapshotActivityRows(binding: string, taskId: string) {
    const seen = new Set<string>();
    for (const active of [true, false]) {
      const rows = iterateRows(
        this.database,
        this.database
          .select({ id: activity.id, value: activity.value })
          .from(activity)
          .where(
            and(
              eq(activity.binding, binding),
              eq(activity.taskId, taskId),
              active ? activeActivityFilter : undefined,
            ),
          )
          .orderBy(desc(sql`rowid`))
          .limit(64),
      );
      let bytes = 0;
      let rowsRead = 0;
      try {
        for (const row of rows) {
          if (!active) {
            const size = Buffer.byteLength(row.value);
            if (rowsRead && bytes + size > 192 * 1024) break;
            rowsRead++;
            bytes += size;
          }
          if (!seen.has(row.id)) {
            seen.add(row.id);
            yield row;
          }
        }
      } finally {
        rows.return();
      }
    }
  }

  snapshot(binding: string) {
    // The first task read fixes the WAL view for rows, counts and the journal watermark.
    return this.database.transaction(() => {
      const recent = this.database
        .$with("recent")
        .as(
          this.database
            .select({ id: tasks.id })
            .from(tasks)
            .where(eq(taskBinding, binding))
            .orderBy(desc(taskCreatedAt), asc(tasks.id))
            .limit(100),
        );
      const selectedIds = this.database.$with("selected").as(
        this.database
          .with(recent)
          .select({ id: recent.id })
          .from(recent)
          // SQLite needs this hint to avoid scanning a binding's entire task history.
          // Drizzle has no SQLite INDEXED BY API, so keep this source as a SQL fragment.
          .union(
            this.database
              .select({ id: sql<string>`${tasks.id}`.as("id") })
              .from(sql`${tasks} INDEXED BY ${sql.identifier("tasks_binding_active")}`)
              .where(and(eq(taskBinding, binding), activeTaskFilter)),
          ),
      );
      const selected = this.database
        .with(selectedIds)
        .select({ value: tasks.value })
        .from(tasks)
        .innerJoin(selectedIds, eq(tasks.id, selectedIds.id))
        .orderBy(desc(taskCreatedAt), asc(tasks.id))
        .all()
        .map((row) => stored(row.value) as LocalAgentTask);
      const ids = selected.map((local) => local.task.id);
      const selectedTaskIds = this.database
        .select({ value: sql<string>`value` })
        .from(sql`json_each(${JSON.stringify(ids)})`);
      const records: SnapshotRecord[] = selected.map((local) => ({
        kind: "task",
        // Reserve the completion flag before computing the byte budget (false is longer than true).
        task: { ...local.task, activityIncomplete: false },
      }));
      for (const row of iterateRows(
        this.database,
        this.database
          .select({ value: requests.value })
          .from(requests)
          .where(and(eq(requests.binding, binding), inArray(requestTaskId, selectedTaskIds)))
          .orderBy(sql`rowid`),
      ))
        records.push({ kind: "request", request: stored(row.value) as HumanRequest });
      const totals = new Map(
        this.database
          .select({ taskId: activity.taskId, count: count() })
          .from(activity)
          .where(and(eq(activity.binding, binding), inArray(activity.taskId, selectedTaskIds)))
          .groupBy(activity.taskId)
          .all()
          .map((row) => [row.taskId, row.count]),
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
    });
  }
  recordActivity(binding: string, draft: ActivityDraft): TaskActivity {
    return this.database.transaction(() => {
      const old = this.database
        .select({
          rowid: sql<number>`rowid`,
          binding: activity.binding,
          taskId: activity.taskId,
          value: activity.value,
        })
        .from(activity)
        .where(eq(activity.id, draft.id))
        .get();
      if (old && (old.binding !== binding || old.taskId !== draft.taskId))
        throw new LocalError("IDEMPOTENCY_CONFLICT", "Activity identity changed");
      if (!old)
        this.database
          .insert(activity)
          .values({ id: draft.id, binding, taskId: draft.taskId, value: "{}" })
          .run();
      const order =
        old?.rowid ??
        this.database
          .select({ rowid: sql<number>`rowid` })
          .from(activity)
          .where(eq(activity.id, draft.id))
          .get()!.rowid;
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
        .update(activity)
        .set({ value: JSON.stringify(entry) })
        .where(eq(activity.id, entry.id))
        .run();
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
    });
  }
  seen(id: string) {
    return Boolean(
      this.database.select({ id: receipts.id }).from(receipts).where(eq(receipts.id, id)).get(),
    );
  }
  receipt(id: string) {
    this.database.insert(receipts).values({ id }).onConflictDoNothing().run();
  }
  event(binding: string, event: AgentEvent) {
    this.database.transaction(() => {
      const value = JSON.stringify(normalizeTaskJson(event)),
        local = isDesktopBinding(binding);
      if (!local) this.database.insert(outbox).values({ id: event.id, binding, value: "" }).run();
      this.database.insert(journal).values({ id: event.id, binding, value }).run();
      // Local history has no cloud copy; only relay replay is a rolling cache.
      if (!local) this.compact(binding);
    });
  }
  private compact(binding: string) {
    this.database.transaction(() => {
      const window = this.database
        .select({
          sequence: journal.sequence,
          position: sql<number>`row_number() OVER (ORDER BY ${journal.sequence} DESC)`.as(
            "position",
          ),
          bytes:
            sql<number>`sum(length(CAST(${journal.value} AS BLOB))) OVER (ORDER BY ${journal.sequence} DESC)`.as(
              "bytes",
            ),
        })
        .from(journal)
        .where(eq(journal.binding, binding))
        .as("replay_window");
      this.database
        .delete(journal)
        .where(
          and(
            eq(journal.binding, binding),
            inArray(
              journal.sequence,
              this.database
                .select({ sequence: window.sequence })
                .from(window)
                .where(
                  or(gt(window.position, this.retained), gt(window.bytes, this.retainedBytes)),
                ),
            ),
          ),
        )
        .run();
      this.database
        .delete(outbox)
        .where(
          and(
            eq(outbox.binding, binding),
            notInArray(
              outbox.id,
              this.database
                .select({ id: journal.id })
                .from(journal)
                .where(eq(journal.binding, binding)),
            ),
          ),
        )
        .run();
    });
  }
  sequence(binding: string) {
    return this.database
      .select({ value: sql<number>`COALESCE(MAX(${journal.sequence}),0)` })
      .from(journal)
      .where(eq(journal.binding, binding))
      .get()!.value;
  }
  replay(binding: string, after: number) {
    const floor = this.database
      .select({ value: sql<number>`COALESCE(MIN(${journal.sequence}),0)` })
      .from(journal)
      .where(eq(journal.binding, binding))
      .get()!.value;
    const rows = this.database
      .select({ sequence: journal.sequence, value: journal.value })
      .from(journal)
      .where(and(eq(journal.binding, binding), gt(journal.sequence, after)))
      .orderBy(journal.sequence)
      .limit(50)
      .all();
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
      .delete(outbox)
      .where(
        and(
          eq(outbox.binding, binding),
          or(
            inArray(
              outbox.id,
              this.database
                .select({ id: journal.id })
                .from(journal)
                .where(and(eq(journal.binding, binding), sql`${journal.sequence}<=${sequence}`)),
            ),
            notInArray(
              outbox.id,
              this.database
                .select({ id: journal.id })
                .from(journal)
                .where(eq(journal.binding, binding)),
            ),
          ),
        ),
      )
      .run();
  }
  requests(binding: string, taskId?: string): HumanRequest[] {
    return this.database
      .select({ value: requests.value })
      .from(requests)
      .where(
        and(
          eq(requests.binding, binding),
          taskId === undefined ? undefined : eq(requestTaskId, taskId),
        ),
      )
      .orderBy(sql`rowid`)
      .all()
      .map((row) => stored(row.value));
  }
  getRequest(binding: string, id: string): HumanRequest | undefined {
    const row = this.database
      .select({ value: requests.value })
      .from(requests)
      .where(and(eq(requests.binding, binding), eq(requests.id, id)))
      .get();
    return row ? stored(row.value) : undefined;
  }
  pendingRequests(binding: string): HumanRequest[] {
    return this.database
      .select({ value: requests.value })
      .from(requests)
      .where(
        and(
          eq(requests.binding, binding),
          pendingRequestFilter,
          exists(
            this.database
              .select({ id: tasks.id })
              .from(tasks)
              .where(
                and(
                  eq(tasks.id, requestTaskId),
                  eq(taskBinding, requests.binding),
                  activeTaskFilter,
                ),
              ),
          ),
        ),
      )
      .orderBy(sql`json_extract(${requests.value},'$.expiresAt')`, sql`rowid`)
      .all()
      .map((row) => stored(row.value));
  }
  forget(binding: string, ids: string[], pendingCommands: ReadonlySet<string> = new Set()) {
    this.database.transaction(() => {
      const removed = new Set(ids);
      // Include orphaned receipts from earlier clears. Read this binding once, before
      // deleting requests needed to associate approval decisions with their task.
      const savedCommands = this.database
        .select({ id: commands.id, payload: commands.payload })
        .from(commands)
        .where(eq(sql`json_extract(${commands.payload},'$.binding')`, binding))
        .all();
      for (const command of savedCommands) {
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
              .select({ id: tasks.id })
              .from(tasks)
              .where(and(eq(tasks.id, taskId), eq(taskBinding, binding)))
              .get()
          )
            continue;
        }
        this.database
          .update(commands)
          .set({ payload: forgottenCommand(command.payload), result: forgottenResult })
          .where(eq(commands.id, command.id))
          .run();
      }
      for (const id of ids) {
        this.database
          .delete(tasks)
          .where(and(eq(tasks.id, id), eq(taskBinding, binding)))
          .run();
        this.database
          .delete(activity)
          .where(and(eq(activity.binding, binding), eq(activity.taskId, id)))
          .run();
        this.database
          .delete(requests)
          .where(and(eq(requests.binding, binding), eq(requestTaskId, id)))
          .run();
        this.database
          .delete(journal)
          .where(and(eq(journal.binding, binding), eq(journalTaskId, id)))
          .run();
      }
    });
  }
  request(binding: string, value: HumanRequest) {
    this.database.transaction(() => {
      // Approval enumeration and snapshot ordering depend on REPLACE's new rowid.
      this.database.run(
        sql`INSERT OR REPLACE INTO ${requests} (id,binding,value) VALUES (${value.id},${binding},${JSON.stringify(normalizeTaskJson(value))})`,
      );
      this.event(binding, {
        id: crypto.randomUUID(),
        taskId: value.taskId,
        kind: "request",
        request: value,
      });
    });
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
      .select({ payload: commands.payload, result: commands.result })
      .from(commands)
      .where(eq(commands.id, command.id))
      .get();
    if (old) {
      if (old.payload !== payload && old.payload !== forgottenCommand(payload))
        throw new LocalError("IDEMPOTENCY_CONFLICT", "Command identity changed");
      return old.result ? JSON.parse(old.result) : null;
    }
    this.database.insert(commands).values({ id: command.id, payload, result: null }).run();
    return null;
  }
  complete(id: string, result: { ok: true; value: unknown } | { ok: false; code: string }) {
    // A completion racing an explicit clear must not restore a private result.
    this.database
      .update(commands)
      .set({ result: JSON.stringify(result) })
      .where(and(eq(commands.id, id), isNull(sql`json_extract(${commands.payload},'$.forgotten')`)))
      .run();
  }
  events(binding: string): AgentEvent[] {
    const values = this.database
      .select({ value: journal.value })
      .from(outbox)
      .innerJoin(journal, and(eq(journal.id, outbox.id), eq(journal.binding, outbox.binding)))
      .where(eq(outbox.binding, binding))
      .orderBy(journal.sequence)
      .limit(50)
      .all()
      .map((row) => stored(row.value) as AgentEvent);
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
        this.database
          .delete(outbox)
          .where(and(eq(outbox.binding, binding), eq(outbox.id, id)))
          .run();
    });
  }
  close() {
    this.database.$client.close();
  }
}
