import type { RelayCommand } from "@raypx/contracts/tasks";
import {
  activeTaskStatuses,
  type AgentEvent,
  type AgentProvider,
  type HumanRequest,
  type TaskActivity,
} from "@raypx/core/tasks";
import type { LocalDatabase } from "../sqlite/index.js";
import type { ActivityDraft, LocalAgentTask } from "./model.js";
import type { ExecutionStore } from "./harness/ports.js";
import { OrchestrationSink } from "./infrastructure/store/sink.js";
import { EffectLog } from "./infrastructure/store/effects.js";
import { TaskEventLog } from "./infrastructure/store/events.js";
import { toWireEvents } from "./domain/wire.js";
import type { OrchestrationEvent } from "./domain/events.js";
import type { EffectCommand, LiveFacts } from "./domain/commands.js";
import { decide, type Decision } from "./domain/decider.js";
import { cryptoIds, systemClock, type Clock, type Ids } from "./domain/ports.js";
import { ActivityLog } from "./infrastructure/store/activity.js";
import { clearTasks } from "./infrastructure/store/clear.js";
import { CommandReceipts } from "./infrastructure/store/commands.js";
import { EventJournal } from "./infrastructure/store/journal.js";
import { ProfileSettings } from "./infrastructure/store/profile.js";
import { RequestRecords } from "./infrastructure/store/requests.js";
import { taskSnapshot } from "./infrastructure/store/snapshot.js";
import { TaskRecords } from "./infrastructure/store/tasks.js";

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
  private readonly sink: OrchestrationSink;
  private readonly effects: EffectLog;
  private readonly historyLog: TaskEventLog;
  // Relay replay keeps a rolling window per binding; tests pass a small window.
  constructor(
    private readonly database: LocalDatabase,
    retained = 4096,
    retainedBytes = 8 * 1024 * 1024,
    private readonly clock: Clock = systemClock,
    private readonly ids: Ids = cryptoIds,
  ) {
    this.journal = new EventJournal(database, retained, retainedBytes);
    this.streamId = this.journal.streamId;
    this.profile = new ProfileSettings(database);
    this.taskRecords = new TaskRecords(database);
    this.activityLog = new ActivityLog(database);
    this.requestRecords = new RequestRecords(database);
    this.commands = new CommandReceipts(database);
    this.effects = new EffectLog(database);
    this.historyLog = new TaskEventLog(database);
    this.sink = new OrchestrationSink({
      database,
      journal: this.journal,
      tasks: this.taskRecords,
      requests: this.requestRecords,
      activity: this.activityLog,
      commands: this.commands,
      events: this.historyLog,
      clock: this.clock,
      ids: this.ids,
    });
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
  /**
   * Commit the aggregate's own change: a bound provider session or a plan-to-run
   * mode switch. Other fields reach storage through their own command.
   */
  put(value: LocalAgentTask): undefined {
    this.database.transaction(() => {
      const previous = this.taskRecords.get(value.task.id);
      this.taskRecords.put(value);
      const at = this.clock.now().toISOString();
      if (!previous || previous.sessionId !== value.sessionId) {
        const event: OrchestrationEvent = {
          type: "task.sessionBound",
          id: this.ids.generate(),
          binding: value.binding,
          taskId: value.task.id,
          at,
          task: value.task,
          sessionId: value.sessionId,
          ...(value.tokenUsage ? { tokenUsage: value.tokenUsage } : {}),
        };
        this.sink.persist(event);
        for (const wire of toWireEvents(event)) this.event(value.binding, wire);
      } else if (previous.task.mode !== value.task.mode) {
        const event: OrchestrationEvent = {
          type: "task.modeChanged",
          id: this.ids.generate(),
          binding: value.binding,
          taskId: value.task.id,
          at,
          task: value.task,
          sessionId: value.sessionId,
          mode: value.task.mode,
        };
        this.sink.persist(event);
        for (const wire of toWireEvents(event)) this.event(value.binding, wire);
      }
    });
    return undefined;
  }
  tokenUsage(sessionId: string) {
    return this.taskRecords.tokenUsage(sessionId);
  }
  recordTokenUsage(local: LocalAgentTask, totals: NonNullable<LocalAgentTask["tokenUsage"]>) {
    this.sink.tokenUsage(local, totals);
  }
  // Operations spanning record families go through the one sink, so each step
  // stays one observable seam inside a single transaction.
  accept(value: LocalAgentTask, id: string) {
    this.sink.commit(
      [
        {
          type: "task.accepted",
          id: this.ids.generate(),
          binding: value.binding,
          taskId: value.task.id,
          at: this.clock.now().toISOString(),
          task: value.task,
          sessionId: value.sessionId,
          receiptId: id,
        },
      ],
      id,
    );
  }
  /**
   * Saves a task change; a task leaving the active statuses settles its open work.
   * The `status` event is the wire projection of this change.
   */
  transition(
    value: LocalAgentTask,
    event: Extract<AgentEvent, { kind: "status" }>,
    inputCode: Extract<TaskActivity, { kind: "input" }>["code"] = "TASK_STOPPED",
  ) {
    this.database.transaction(() => {
      this.taskRecords.put(value);
      this.sink.persist({
        type: "task.statusChanged",
        id: event.id,
        binding: value.binding,
        taskId: value.task.id,
        at: this.clock.now().toISOString(),
        task: value.task,
        sessionId: value.sessionId,
        settledRequests: [],
        settledActivity: [],
      });
      if (!activeTaskStatuses.includes(value.task.status)) {
        for (const request of this.requests(value.binding, value.task.id))
          if (["pending", "decided"].includes(request.status))
            this.sink.recordRequest(value.binding, { ...request, status: "cancelled" });
        for (const entry of this.activity(value.binding, value.task.id))
          if (entry.kind === "input" && ["queued", "sending"].includes(entry.status))
            this.sink.recordActivity(value.binding, {
              ...entry,
              status: entry.status === "sending" ? "interrupted" : "cancelled",
              code: inputCode,
              updatedAt: this.clock.now().toISOString(),
            });
          else if (
            (entry.kind === "message" && entry.status === "streaming") ||
            (entry.kind === "tool" && entry.status === "running")
          )
            this.sink.recordActivity(value.binding, {
              ...entry,
              status: "interrupted",
              updatedAt: this.clock.now().toISOString(),
            });
      }
      // Journal the caller's event unchanged; the domain event describes the same change.
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
  /**
   * Upsert one activity entry, then project it. Relay bindings also journal the
   * change; Desktop bindings keep only the latest projection.
   */
  recordActivity(binding: string, draft: ActivityDraft) {
    return this.sink.recordActivity(binding, draft);
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
  /** Upsert one request, then journal its state for relay bindings. */
  request(binding: string, value: HumanRequest): undefined {
    this.sink.recordRequest(binding, value);
    return undefined;
  }

  /**
   * Decide an entry command against the committed records and commit the result
   * in one transaction. The synchronous SQLite transaction is the per-task lock:
   * no other decision interleaves between the read and the write. Effects are
   * returned for the worker to run after the commit; a rejection commits nothing.
   */
  submit(command: EffectCommand, live: LiveFacts): Decision {
    return this.database.transaction(() => {
      const taskId =
        command.type === "start"
          ? command.task.id
          : command.type === "input"
            ? command.input.taskId
            : command.taskId;
      const task = this.taskRecords.get(taskId);
      const decision = decide(
        {
          binding: command.binding,
          task: task && task.binding === command.binding ? task : undefined,
          requests: task ? this.requestRecords.list(command.binding, taskId) : [],
          activity: task ? this.activityLog.list(command.binding, taskId) : [],
          live,
        },
        command,
        { nextId: () => this.ids.generate(), now: () => this.clock.now().toISOString() },
      );
      for (const event of decision.events)
        if (event.type === "request.decided" || event.type === "request.applied")
          this.sink.recordRequest(event.binding, event.request);
      // Each effect intent commits with the decision that produced it.
      const at = this.clock.now().toISOString();
      const effects = decision.effects.map((effect) => {
        const id = this.ids.generate();
        this.effects.record(id, effect, at);
        return { ...effect, effectId: id };
      });
      return { ...decision, effects };
    });
  }

  /** Settle an effect once the worker has run it. */
  settleEffect(id: string, status: "done" | "failed") {
    this.effects.settle(id, status, this.clock.now().toISOString());
  }

  /**
   * Startup recovery: mark effects a previous process left open as abandoned, and
   * prune settled effects past their retention. Returns the affected task ids;
   * the caller interrupts any that are still active with HOST_RESTARTED.
   */
  recoverEffects() {
    const now = this.clock.now();
    const abandoned = this.effects.abandonOpen(now.toISOString());
    this.effects.prune(now.getTime());
    return abandoned;
  }

  effectRecords(binding: string, taskId: string) {
    return this.effects.list(binding, taskId);
  }

  /** A task's committed orchestration events, oldest first. */
  history(binding: string, taskId: string) {
    return this.historyLog.list(binding, taskId);
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
