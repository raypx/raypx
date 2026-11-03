import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { AgentProvider, AgentTask } from "@raypx/core/tasks";
import { normalizeTaskJson } from "@raypx/core/task-text";
import type { LocalDatabase } from "../../../sqlite";
import { storedRecord } from "../../../sqlite/records";
import { agentMeta, tasks } from "../../../sqlite/schema";
import { localAgentTaskSchema, tokenUsageSchema, type LocalAgentTask } from "../../model";
import { activeTaskFilter, taskBinding, taskCreatedAt } from "./queries";

const taskPageCursor = sql<string>`${taskCreatedAt} || ':' || ${tasks.id}`;

/** Local task records with their provider session usage totals. */
export class TaskRecords {
  constructor(private readonly database: LocalDatabase) {}

  get(id: string): LocalAgentTask | undefined {
    const row = this.database
      .select({ value: tasks.value })
      .from(tasks)
      .where(eq(tasks.id, id))
      .get();
    return row ? storedRecord(localAgentTaskSchema, row.value) : undefined;
  }
  list(options: { binding?: string; activeOnly?: boolean } = {}): LocalAgentTask[] {
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
      .map((row) => storedRecord(localAgentTaskSchema, row.value));
  }
  page(
    binding: string,
    limit: number,
    before?: string,
    projectId?: string,
    deviceId?: string,
  ): AgentTask[] {
    before ||= undefined;
    return this.database
      .select({ value: tasks.value })
      .from(tasks)
      .where(
        and(
          eq(taskBinding, binding),
          deviceId === undefined
            ? undefined
            : eq(sql`json_extract(${tasks.value},'$.task.deviceId')`, deviceId),
          before === undefined ? undefined : lt(taskPageCursor, before),
          projectId === undefined
            ? undefined
            : eq(sql`json_extract(${tasks.value},'$.task.projectId')`, projectId),
        ),
      )
      .orderBy(desc(taskPageCursor))
      .limit(limit)
      .all()
      .map((row) => storedRecord(localAgentTaskSchema, row.value).task);
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
  put(value: LocalAgentTask): undefined {
    // Preserve REPLACE's rowid semantics for callers enumerating task records.
    this.database.run(
      sql`INSERT OR REPLACE INTO ${tasks} (id,value) VALUES (${value.task.id},${JSON.stringify(normalizeTaskJson(value))})`,
    );
  }
  tokenUsage(sessionId: string): LocalAgentTask["tokenUsage"] {
    const row = this.database
      .select({ value: agentMeta.value })
      .from(agentMeta)
      .where(eq(agentMeta.id, `usage:codex:${sessionId}`))
      .get();
    return row ? storedRecord(tokenUsageSchema, row.value) : undefined;
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
}
