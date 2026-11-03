import type { RelayCommand } from "@raypx/contracts/tasks";
import {
  activeTaskStatuses,
  type AgentEvent,
  type AgentProvider,
  type HumanRequest,
  type TaskActivity,
} from "@raypx/core/tasks";
import type { LocalDatabase } from "../sqlite";
import type { ActivityDraft, LocalAgentTask } from "./model";
import type { ExecutionStore } from "./harness/ports";
import { ActivityLog } from "./infrastructure/store/activity";
import { clearTasks } from "./infrastructure/store/clear";
import { CommandReceipts } from "./infrastructure/store/commands";
import { EventJournal } from "./infrastructure/store/journal";
import { ProfileSettings } from "./infrastructure/store/profile";
import { RequestRecords } from "./infrastructure/store/requests";
import { taskSnapshot } from "./infrastructure/store/snapshot";
import { TaskRecords } from "./infrastructure/store/tasks";

/**
 * The agent persistence facade. Each record family lives in `infrastructure/store`;
 * this class keeps the shared surface and the transactions that span families.
 */
export class AgentStore implements ExecutionStore {
  readonly streamId: string;
  private readonly journal: EventJournal;
  private readonly profile: ProfileSettings;
  private readonly taskRecords: TaskRecords;
  private readonly activityLog: ActivityLog;
  private readonly requestRecords: RequestRecords;
  private readonly commands: CommandReceipts;
  // Relay replay keeps a rolling window per binding; tests pass a small window.
  constructor(
    private readonly database: LocalDatabase,
    retained = 4096,
    retainedBytes = 8 * 1024 * 1024,
  ) {
    this.journal = new EventJournal(database, retained, retainedBytes);
    this.streamId = this.journal.streamId;
    this.profile = new ProfileSettings(database);
    this.taskRecords = new TaskRecords(database);
    const append = (binding: string, event: AgentEvent) => this.event(binding, event);
    this.activityLog = new ActivityLog(database, append);
    this.requestRecords = new RequestRecords(database, append);
    this.commands = new CommandReceipts(database);
  }

  projects() {
    return this.profile.projects();
  }
  configure(id: string, providers: AgentProvider[]) {
    this.profile.configure(id, providers);
  }
  deviceId(binding: string) {
    return this.profile.deviceId(binding);
  }

  get(id: string) {
    return this.taskRecords.get(id);
  }
  tasks(options: { binding?: string; activeOnly?: boolean } = {}) {
    return this.taskRecords.list(options);
  }
  taskPage(binding: string, limit: number, before?: string, projectId?: string, deviceId?: string) {
    return this.taskRecords.page(binding, limit, before, projectId, deviceId);
  }
  hasActiveSession(provider: AgentProvider, sessionId: string) {
    return this.taskRecords.hasActiveSession(provider, sessionId);
  }
  put(value: LocalAgentTask): undefined {
    return this.taskRecords.put(value);
  }
  tokenUsage(sessionId: string) {
    return this.taskRecords.tokenUsage(sessionId);
  }
  recordTokenUsage(local: LocalAgentTask, totals: NonNullable<LocalAgentTask["tokenUsage"]>) {
    this.taskRecords.recordTokenUsage(local, totals);
  }
  // Operations spanning record families go through this facade's own methods, so each
  // step stays one observable seam inside the shared transaction.
  accept(value: LocalAgentTask, id: string) {
    this.database.transaction(() => {
      this.receipt(id);
      this.put(value);
    });
  }
  /** Saves a task change; a task leaving the active statuses settles its open work. */
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
  forget(binding: string, ids: string[], pendingCommands: ReadonlySet<string> = new Set()) {
    clearTasks(
      {
        database: this.database,
        commands: this.commands,
        getRequest: (owner, id) => this.getRequest(owner, id),
      },
      binding,
      ids,
      pendingCommands,
    );
  }
  snapshot(binding: string) {
    return taskSnapshot(this.database, binding, () => this.sequence(binding));
  }

  activity(binding: string, taskId: string) {
    return this.activityLog.list(binding, taskId);
  }
  activityPage(binding: string, taskId: string, before?: number) {
    return this.activityLog.page(binding, taskId, before);
  }
  recordActivity(binding: string, draft: ActivityDraft) {
    return this.activityLog.record(binding, draft);
  }

  requests(binding: string, taskId?: string) {
    return this.requestRecords.list(binding, taskId);
  }
  getRequest(binding: string, id: string) {
    return this.requestRecords.get(binding, id);
  }
  pendingRequests(binding: string) {
    return this.requestRecords.pending(binding);
  }
  request(binding: string, value: HumanRequest): undefined {
    return this.requestRecords.record(binding, value);
  }

  seen(id: string) {
    return this.commands.seen(id);
  }
  receipt(id: string) {
    this.commands.receipt(id);
  }
  reserve(binding: string, command: RelayCommand) {
    return this.commands.reserve(binding, command);
  }
  complete(id: string, result: { ok: true; value: unknown } | { ok: false; code: string }) {
    this.commands.complete(id, result);
  }

  event(binding: string, event: AgentEvent) {
    this.journal.append(binding, event);
  }
  sequence(binding: string) {
    return this.journal.sequence(binding);
  }
  replay(binding: string, after: number) {
    return this.journal.replay(binding, after);
  }
  taskEvents(binding: string, id: string, after: number) {
    return this.journal.taskEvents(binding, id, after);
  }
  checkpoint(binding: string, sequence: number) {
    this.journal.checkpoint(binding, sequence);
  }
  events(binding: string) {
    return this.journal.unsent(binding);
  }
  ack(binding: string, ids: string[]) {
    this.journal.ack(binding, ids);
  }
}
