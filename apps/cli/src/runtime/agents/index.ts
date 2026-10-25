import type { RecordDiagnostic } from "../../diagnostics";
import { existsSync, realpathSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import {
  taskText,
  activeTaskStatuses,
  humanRequestSchema,
  type AgentTask,
  type AgentProvider,
  type AgentCapability,
  type AgentEvent,
  type DeviceProject,
  type DeviceCommand,
  type HumanDecision,
  type HumanRequest,
  type RelayCommand,
  type SnapshotRecord,
  type RelayRequest,
  type SyncDevice,
  type TaskInput,
  type TaskChange,
  validDecision,
} from "@raypx/contracts/tasks";
import { type StateStore, acquireLock } from "../state";
import { LocalError } from "../errors";
import { AgentStore, desktopBinding, isDesktopBinding, type LocalAgentTask } from "./store";
import { JsonProcess } from "./transport";
import { ConversationRecorder } from "./activity";
import manifest from "../../../package.json";

type Pending = {
  request: HumanRequest;
  resolve(decision: HumanDecision): void;
  timer: ReturnType<typeof setTimeout>;
};
type Execution = {
  local: LocalAgentTask;
  process?: JsonProcess;
  unlock(): void;
  pending: Map<string, Pending>;
  cancelled: boolean;
  sessionReady?: Promise<void>;
  finished: boolean;
  summary: string;
  preview: string;
  items: Map<string, Record<string, unknown>>;
  awaitingPlan?: boolean;
  planRequestHandled?: boolean;
  conversation: ConversationRecorder;
  inputs: TaskInput[];
  operation: Promise<void>;
  ready: boolean;
  turnActive: boolean;
  turnId: string;
  interrupting: boolean;
  interruptTimer?: ReturnType<typeof setTimeout>;
  sendTurn?: (prompt: string) => Promise<void>;
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, max = 128_000) =>
  typeof value === "string" ? taskText(value, max) : "";
// The first record always passes so cursors advance past oversized events.
// Unordered sets skip a record that does not fit instead of hiding the rest.
export function bounded<T>(records: T[], skip = false, budget = 256 * 1024): T[] {
  let bytes = 0;
  const result: T[] = [];
  for (const record of records) {
    const size = Buffer.byteLength(JSON.stringify(record));
    if (result.length && bytes + size > budget) {
      if (skip) continue;
      break;
    }
    result.push(record);
    bytes += size;
  }
  return result;
}
export class AgentRuntime {
  readonly instanceId = crypto.randomUUID();
  private readonly store: AgentStore;
  private readonly active = new Map<string, Execution>();
  private readonly bindingVersions = new Map<string, number>();
  private readonly executables = new Map<AgentProvider, string>();
  private capabilitiesCache: AgentCapability[] | undefined;
  private server: ReturnType<typeof Bun.serve> | undefined;
  private readonly hookTokens = new Map<string, string>();
  private closing = false;
  private readonly completions = new Set<Promise<void>>();
  private readonly remoteCommands = new Map<
    string,
    Promise<{ ok: true; value: unknown } | { ok: false; code: string }>
  >();
  private readonly cancelledStarts = new Set<string>();
  private readonly snapshots = new Map<
    string,
    { binding: string; expires: number; sequence: number; records: SnapshotRecord[] }
  >();
  constructor(
    private readonly state: StateStore,
    // A pending request id is passed only for local work; relay delivery notifies separately.
    private readonly changed: (pendingRequest?: string, change?: TaskChange) => void,
    private readonly options: {
      executables?: Partial<Record<AgentProvider, string>>;
      recordDiagnostic?: RecordDiagnostic;
    } = {},
  ) {
    this.store = new AgentStore(state.directory, undefined, undefined, options.recordDiagnostic);
    for (const local of this.store.tasks())
      if (activeTaskStatuses.includes(local.task.status))
        this.status(local, "interrupted", undefined, "HOST_RESTARTED");
  }
  async localDevice(accountId: string): Promise<SyncDevice> {
    return {
      id: this.store.deviceId(desktopBinding(accountId)),
      name: hostname(),
      platform: process.platform,
      appVersion: manifest.version,
      epoch: 1,
      revoked: false,
      lastSeenAt: new Date().toISOString(),
      online: true,
      projects: await this.projects(),
      capabilities: await this.capabilities(),
    };
  }
  localTasks(accountId: string, limit: number, before?: string) {
    return bounded(
      this.store
        .tasks()
        .filter((local) => local.binding === desktopBinding(accountId))
        .map((local) => local.task)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .filter((task) => !before || `${task.createdAt}:${task.id}` < before)
        .slice(0, limit),
    );
  }
  localTask(accountId: string, id: string, after: number, beforeActivity?: number) {
    const binding = desktopBinding(accountId),
      local = this.store.get(id);
    if (!local || local.binding !== binding) throw new LocalError("NOT_FOUND", "Task unavailable");
    return {
      task: local.task,
      ...this.store.activityPage(binding, id, beforeActivity),
      events: bounded(this.store.taskEvents(binding, id, after)),
      requests: bounded(
        this.store
          .requests(binding)
          .filter((request) => request.taskId === id)
          .reverse(),
        true,
      ),
    };
  }
  localApprovals(accountId: string) {
    const binding = desktopBinding(accountId);
    return bounded(
      this.store
        .requests(binding)
        .filter((request) => {
          const local = this.store.get(request.taskId);
          return (
            ["pending", "decided"].includes(request.status) &&
            local &&
            activeTaskStatuses.includes(local.task.status)
          );
        })
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)),
      true,
    );
  }
  async localExecute(accountId: string, id: string, request: RelayRequest) {
    const binding = desktopBinding(accountId),
      deviceId = this.store.deviceId(binding);
    if (
      (request.method === "tasks.create" && request.input.deviceId !== deviceId) ||
      ((request.method === "tasks.create" ||
        request.method === "tasks.followUp" ||
        request.method === "tasks.input") &&
        request.input.id !== id)
    )
      return { ok: false as const, code: "IDEMPOTENCY_CONFLICT" };
    return this.remote(binding, {
      id,
      deviceId,
      request,
      expiresAt: new Date(Date.now() + 15_000).toISOString(),
    });
  }
  // Local history has no cloud copy, so finished tasks are removed only on request.
  localClear(accountId: string) {
    const binding = desktopBinding(accountId),
      tasks = this.store
        .tasks()
        .filter((local) => local.binding === binding)
        .map((local) => local.task),
      kept = new Set(
        tasks
          .filter((task) => activeTaskStatuses.includes(task.status) || this.active.has(task.id))
          .flatMap((task) => [task.id, ...(task.parentTaskId ? [task.parentTaskId] : [])]),
      ),
      removed = tasks.filter((task) => !kept.has(task.id)).map((task) => task.id);
    this.store.forget(binding, removed);
    this.changed();
    return { removed: removed.length };
  }
  localDetach(accountId: string) {
    return this.detach(desktopBinding(accountId));
  }
  private emit(local: LocalAgentTask, event: AgentEvent) {
    this.store.event(local.binding, event);
    this.changedFor(local, event);
  }
  private changedFor(local: LocalAgentTask, event: AgentEvent) {
    this.changed(undefined, {
      type: "events",
      local: isDesktopBinding(local.binding),
      deviceId: local.task.deviceId,
      events: [{ sequence: 1, event }],
    });
  }
  private status(
    local: LocalAgentTask,
    status: AgentTask["status"],
    summary = "",
    inputCode?: TaskInput["code"],
  ) {
    const task = {
      ...local.task,
      status,
      summary: taskText(summary, 32_000),
      updatedAt: new Date().toISOString(),
    };
    const event: AgentEvent = {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "status",
      status,
      summary: task.summary,
      task,
    };
    this.store.transition(
      { ...local, task },
      event,
      inputCode ?? (summary === "INPUT_DELIVERY_FAILED" ? "INPUT_DELIVERY_FAILED" : "TASK_STOPPED"),
    );
    Object.assign(local.task, task);
    this.changedFor(local, event);
  }
  async capabilities(): Promise<AgentCapability[]> {
    if (this.capabilitiesCache) return this.capabilitiesCache;
    this.capabilitiesCache = await Promise.all(
      (["claude", "codex"] as const).map(async (provider) => {
        const suffix = process.platform === "win32" ? ".exe" : "";
        const candidates = [
          this.options.executables?.[provider],
          Bun.which(provider),
          join(homedir(), ".local", "bin", provider + suffix),
          join(homedir(), ".bun", "bin", provider + suffix),
          join("/opt/homebrew/bin", provider),
        ];
        const executable = candidates.find((value) => value && existsSync(value));
        if (!executable)
          return { provider, available: false, version: "", reason: "missing" as const };
        try {
          const child = Bun.spawn([executable, "--version"], { stdout: "pipe", stderr: "ignore" });
          const timeout = setTimeout(() => child.kill(), 3000);
          const version = (await new Response(child.stdout).text()).trim().slice(0, 120);
          const code = await child.exited;
          clearTimeout(timeout);
          const match = /(\d+)\.(\d+)\.(\d+)/.exec(version);
          const supported =
            code === 0 &&
            match &&
            (provider === "claude"
              ? Number(match[1]) > 2 ||
                (Number(match[1]) === 2 &&
                  (Number(match[2]) > 1 || (Number(match[2]) === 1 && Number(match[3]) >= 302)))
              : Number(match[1]) > 0 || Number(match[2]) >= 163);
          if (supported) this.executables.set(provider, executable);
          return {
            provider,
            available: Boolean(supported),
            version,
            reason: supported ? ("ready" as const) : ("unsupported" as const),
            ...(supported ? { inputModes: ["steer", "queue"] as ("steer" | "queue")[] } : {}),
          };
        } catch {
          return { provider, available: false, version: "", reason: "unsupported" as const };
        }
      }),
    );
    return this.capabilitiesCache;
  }
  configure(rootId: string, providers: AgentProvider[]) {
    this.state.root(rootId);
    this.store.configure(rootId, providers);
    this.changed();
    return { configured: true };
  }
  managesSession(provider: AgentProvider, sessionId: string) {
    return this.store
      .tasks()
      .some(
        (local) =>
          local.task.provider === provider &&
          local.sessionId === sessionId &&
          activeTaskStatuses.includes(local.task.status),
      );
  }
  projectProviders(rootId: string) {
    return this.store.projects().find((project) => project.id === rootId)?.providers ?? [];
  }
  async projects(): Promise<DeviceProject[]> {
    const roots = this.state.roots();
    const result: DeviceProject[] = [];
    for (const project of this.store.projects()) {
      const root = roots.find((item) => item.id === project.id);
      if (!root || !project.providers.length || !existsSync(root.path)) continue;
      let dirty = false;
      try {
        const child = Bun.spawn(["git", "status", "--porcelain", "--untracked-files=no"], {
          cwd: root.path,
          stdout: "pipe",
          stderr: "ignore",
        });
        const timer = setTimeout(() => child.kill(), 2000);
        dirty = Boolean((await new Response(child.stdout).text()).trim());
        await child.exited;
        clearTimeout(timer);
      } catch {
        /* non-Git folders are still valid */
      }
      result.push({ id: root.id, name: root.name, providers: project.providers, dirty });
    }
    return result;
  }
  events(binding: string) {
    return { instanceId: this.instanceId, events: this.store.events(binding) };
  }
  checkpoint(binding: string, sequence: number) {
    this.store.checkpoint(binding, sequence);
    return { accepted: true };
  }
  replay(binding: string, after: number) {
    return this.store.replay(binding, after);
  }
  snapshot(binding: string, id?: string, offset = 0) {
    if (!id) {
      for (const [key, value] of this.snapshots)
        if (value.binding === binding || value.expires < Date.now()) this.snapshots.delete(key);
      id = crypto.randomUUID();
      const tasks = this.store
        .tasks()
        .filter((local) => local.binding === binding)
        .sort((a, b) => b.task.createdAt.localeCompare(a.task.createdAt));
      const selected = tasks.filter(
        (local, index) => index < 100 || activeTaskStatuses.includes(local.task.status),
      );
      const ids = new Set(selected.map((local) => local.task.id));
      const records: SnapshotRecord[] = [
        ...selected.map((local) => ({ kind: "task" as const, task: local.task })),
        ...this.store
          .requests(binding)
          .filter((request) => ids.has(request.taskId))
          .map((request) => ({ kind: "request" as const, request })),
      ];
      const remaining = 32 * 1024 * 1024 - 64 * 1024 - Buffer.byteLength(JSON.stringify(records));
      if (remaining > 128 * 1024) {
        const pages = selected.map((local) => this.store.snapshotActivity(binding, local.task.id));
        const activity: SnapshotRecord[] = [];
        for (let activityOffset = 0; pages.some((page) => page[activityOffset]); activityOffset++)
          for (const page of pages)
            if (page[activityOffset])
              activity.push({ kind: "activity", entry: page[activityOffset]! });
        records.push(...bounded(activity, false, remaining));
      }
      for (const record of records)
        if (record.kind === "task") {
          const total = this.store.activityCount(binding, record.task.id);
          const included = records.filter(
            (entry) => entry.kind === "activity" && entry.entry.taskId === record.task.id,
          ).length;
          record.task = { ...record.task, activityIncomplete: included < total };
        }
      this.snapshots.set(id, {
        binding,
        expires: Date.now() + 120_000,
        sequence: this.store.sequence(binding),
        records,
      });
    }
    const snapshot = this.snapshots.get(id);
    if (!snapshot || snapshot.binding !== binding || snapshot.expires < Date.now())
      throw new LocalError("NOT_FOUND", "Snapshot unavailable");
    const records: SnapshotRecord[] = [];
    let bytes = 0;
    for (const record of snapshot.records.slice(offset, offset + 10)) {
      const size = Buffer.byteLength(JSON.stringify(record));
      if (records.length && bytes + size > 384 * 1024) break;
      records.push(record);
      bytes += size;
    }
    const next = offset + records.length;
    return {
      id,
      streamId: this.store.streamId,
      sequence: snapshot.sequence,
      records,
      next,
      done: next >= snapshot.records.length,
    };
  }
  async remote(binding: string, command: RelayCommand) {
    try {
      if (command.request.method === "observed.decide")
        throw new LocalError("INVALID_METHOD", "Observed approvals belong to the terminal broker");
      const old = this.store.reserve(binding, command);
      if (old) return old;
      const pending = this.remoteCommands.get(command.id);
      if (pending) return pending;
      const operation = this.applyRemote(binding, command).then(
        (value) => ({ ok: true as const, value }),
        (error) => ({
          ok: false as const,
          code: error instanceof LocalError ? error.code : "AGENT_UNAVAILABLE",
        }),
      );
      this.remoteCommands.set(command.id, operation);
      try {
        const result = await operation;
        this.store.complete(command.id, result);
        return result;
      } finally {
        this.remoteCommands.delete(command.id);
      }
    } catch (error) {
      return {
        ok: false as const,
        code: error instanceof LocalError ? error.code : "AGENT_UNAVAILABLE",
      };
    }
  }
  private async applyRemote(binding: string, command: RelayCommand) {
    if (this.closing) throw new LocalError("CLOSING", "Agent host is closing");
    const getTask = (id: string) => {
      const local = this.store.get(id);
      if (!local || local.binding !== binding || local.task.deviceId !== command.deviceId)
        throw new LocalError("NOT_FOUND", "Task unavailable");
      return local;
    };
    const request = command.request;
    if (request.method === "observed.decide")
      throw new LocalError("INVALID_METHOD", "Observed approvals belong to the terminal broker");
    if (
      (request.method === "tasks.create" ||
        request.method === "tasks.followUp" ||
        request.method === "tasks.input") &&
      request.input.id !== command.id
    )
      throw new LocalError("IDEMPOTENCY_CONFLICT", "Command identity changed");
    if (request.method === "tasks.input") {
      const local = getTask(request.input.taskId);
      const old = this.store
        .activity(binding, local.task.id)
        .find((entry) => entry.id === request.input.id);
      // A recorded receipt is never redispatched, including after a host restart.
      if (old?.kind === "input") return old;
      if (old) throw new LocalError("IDEMPOTENCY_CONFLICT", "Input identity changed");
    }
    if (request.method === "tasks.create" || request.method === "tasks.followUp") {
      const existing = this.store.get(request.input.id);
      if (existing) {
        getTask(existing.task.id);
        return existing.task;
      }
    }
    if (Date.parse(command.expiresAt) <= Date.now())
      throw new LocalError("DELIVERY_EXPIRED", "Command expired");
    if (request.method === "tasks.create" || request.method === "tasks.followUp") {
      const input = request.input;
      let task: AgentTask;
      const now = new Date().toISOString();
      if (request.method === "tasks.create")
        task = {
          ...request.input,
          parentTaskId: null,
          status: "pending",
          summary: "",
          createdAt: now,
          updatedAt: now,
        };
      else {
        const parent = getTask(request.input.parentTaskId);
        if (activeTaskStatuses.includes(parent.task.status))
          throw new LocalError("PROJECT_BUSY", "Parent task is still active");
        task = {
          ...parent.task,
          id: input.id,
          parentTaskId: parent.task.id,
          prompt: input.prompt,
          mode: "run",
          status: "pending",
          summary: "",
          createdAt: now,
          updatedAt: now,
        };
      }
      await this.start(binding, command.id, task, command.expiresAt);
      return getTask(task.id).task;
    }
    if (request.method === "tasks.input") {
      const local = getTask(request.input.taskId);
      const execution = this.active.get(local.task.id);
      if (!execution || execution.finished || execution.cancelled)
        throw new LocalError("TASK_STOPPED", "Task stopped");
      if (!execution.ready) throw new LocalError("TASK_NOT_READY", "Agent is starting");
      if (request.input.mode === "steer" && (execution.pending.size || execution.awaitingPlan))
        throw new LocalError("INPUT_WAITING_APPROVAL", "Answer the pending approval first");
      if (execution.inputs.length >= 20)
        throw new LocalError("INPUT_QUEUE_FULL", "Input queue is full");
      if (
        request.input.mode === "steer" &&
        execution.inputs.some((entry) => entry.mode === "steer")
      )
        throw new LocalError("INPUT_IN_PROGRESS", "A steer is being delivered");
      const now = new Date().toISOString();
      const entry = this.store.recordActivity(binding, {
        id: request.input.id,
        taskId: local.task.id,
        kind: "input",
        mode: request.input.mode,
        text: request.input.prompt,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      }) as TaskInput;
      if (entry.mode === "steer") execution.inputs.unshift(entry);
      else execution.inputs.push(entry);
      this.changed();
      if (entry.mode === "steer")
        void this.serial(execution, async () => {
          if (execution.pending.size || execution.awaitingPlan) {
            execution.inputs = execution.inputs.filter((input) => input.id !== entry.id);
            this.inputStatus(execution, entry, "failed", "INPUT_DELIVERY_FAILED");
            return;
          }
          if (!execution.turnActive) {
            await this.nextInput(execution);
            return;
          }
          if (local.task.provider === "codex") {
            this.inputStatus(execution, entry, "sending");
            try {
              await execution.process!.request("turn/steer", {
                threadId: local.sessionId,
                expectedTurnId: execution.turnId,
                input: [{ type: "text", text: entry.text }],
              });
              execution.inputs = execution.inputs.filter((input) => input.id !== entry.id);
              this.inputStatus(execution, entry, "sent");
            } catch (error) {
              if (error instanceof LocalError && error.code === "AGENT_TURN_CHANGED") {
                entry.mode = "queue";
                this.inputStatus(execution, entry, "queued");
                return;
              }
              execution.inputs = execution.inputs.filter((input) => input.id !== entry.id);
              this.inputStatus(execution, entry, "failed", "INPUT_DELIVERY_FAILED");
            }
          } else {
            this.inputStatus(execution, entry, "sending");
            execution.interrupting = true;
            try {
              await execution.process!.control({ subtype: "interrupt" });
              if (execution.turnActive && !execution.finished) {
                clearTimeout(execution.interruptTimer);
                const runner = execution.process;
                execution.interruptTimer = setTimeout(() => {
                  if (execution.process === runner) this.expireInput(execution, entry);
                }, 10_000);
              }
            } catch {
              execution.interrupting = false;
              execution.inputs = execution.inputs.filter((input) => input.id !== entry.id);
              this.inputStatus(execution, entry, "failed", "INPUT_DELIVERY_FAILED");
            }
          }
        });
      return entry;
    }
    if (request.method === "tasks.cancel") {
      const local = getTask(request.input.id);
      if (activeTaskStatuses.includes(local.task.status)) {
        this.cancelledStarts.add(local.task.id);
        const execution = this.active.get(local.task.id);
        if (execution) {
          this.status(local, "cancelling");
          this.cancel(execution);
          await Promise.allSettled(this.completions);
        } else {
          await this.remoteCommands.get(local.task.id);
          if (activeTaskStatuses.includes(local.task.status)) this.status(local, "cancelled");
        }
        this.cancelledStarts.delete(local.task.id);
      }
      return getTask(local.task.id).task;
    }
    const requestValue = this.store
      .requests(binding)
      .find((value) => value.id === request.input.id);
    if (!requestValue) throw new LocalError("NOT_FOUND", "Request unavailable");
    const local = getTask(requestValue.taskId);
    if (!validDecision(requestValue, request.input.decision))
      throw new LocalError("INVALID_ANSWER", "Invalid answer");
    if (
      ["decided", "applied"].includes(requestValue.status) &&
      JSON.stringify(requestValue.decision) === JSON.stringify(request.input.decision)
    )
      return requestValue;
    if (requestValue.status !== "pending")
      throw new LocalError("ALREADY_RESOLVED", "Request already answered");
    if (!activeTaskStatuses.includes(local.task.status) || local.task.status === "cancelling")
      throw new LocalError("REQUEST_CLOSED", "Task stopped");
    if (Date.parse(requestValue.expiresAt) <= Date.now())
      throw new LocalError("REQUEST_EXPIRED", "Request expired");
    const execution = this.active.get(local.task.id);
    if (!execution?.pending.has(requestValue.id))
      throw new LocalError("REQUEST_CLOSED", "Request unavailable");
    this.store.request(binding, {
      ...requestValue,
      status: "decided",
      decision: request.input.decision,
    });
    await this.command(binding, {
      id: command.id,
      type: "decision",
      taskId: local.task.id,
      requestId: requestValue.id,
      decision: request.input.decision,
    });
    return this.store.requests(binding).find((value) => value.id === requestValue.id)!;
  }
  ack(binding: string, ids: string[]) {
    this.store.ack(binding, ids);
    return { accepted: true };
  }
  async command(binding: string, command: DeviceCommand) {
    if (this.store.seen(command.id)) return { accepted: true };
    if (command.type === "start")
      return this.start(binding, command.id, command.task, command.deadline);
    const execution = this.active.get(command.taskId);
    if (execution && execution.local.binding !== binding)
      throw new LocalError("NOT_FOUND", "Task does not belong to binding");
    if (command.type === "cancel") {
      if (execution) this.cancel(execution);
    } else if (execution) {
      const pending = execution.pending.get(command.requestId);
      if (pending && Date.parse(pending.request.expiresAt) > Date.now()) {
        clearTimeout(pending.timer);
        execution.pending.delete(command.requestId);
        pending.resolve(command.decision);
        this.store.request(binding, {
          ...pending.request,
          status: "applied",
          decision: command.decision,
        });
        this.emit(execution.local, {
          id: crypto.randomUUID(),
          taskId: command.taskId,
          kind: "resolved",
          requestId: command.requestId,
        });
      }
    }
    this.store.receipt(command.id);
    return { accepted: true };
  }
  async start(binding: string, commandId: string, task: AgentTask, deadline: string) {
    if (this.store.seen(commandId)) return { accepted: true };
    if (this.closing) throw new LocalError("CLOSING", "Agent host is closing");
    const version = this.bindingVersions.get(binding) ?? 0;
    const local: LocalAgentTask = { task: { ...task }, binding, sessionId: null };
    // Persist the receipt before spawning. An ambiguous crash is interrupted, never replayed.
    this.store.accept(local, commandId);
    if (!Number.isFinite(Date.parse(deadline)) || Date.parse(deadline) <= Date.now()) {
      this.status(local, "delivery_failed");
      return { accepted: true };
    }
    const project = this.store
      .projects()
      .find((p) => p.id === task.projectId && p.providers.includes(task.provider));
    const root = this.state.roots().find((r) => r.id === task.projectId);
    await this.capabilities();
    const executable = this.executables.get(task.provider);
    if (!project || !root || !executable) {
      this.status(local, "failed", "AGENT_UNAVAILABLE");
      return { accepted: true };
    }
    let directory: string;
    try {
      directory = realpathSync(root.path);
    } catch {
      this.status(local, "failed", "PROJECT_UNAVAILABLE");
      return { accepted: true };
    }
    const lockName = `agent-${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(directory))), (b) => b.toString(16).padStart(2, "0")).join("")}`;
    if (
      this.closing ||
      version !== (this.bindingVersions.get(binding) ?? 0) ||
      this.cancelledStarts.has(task.id)
    ) {
      this.status(local, "cancelled");
      return { accepted: true };
    }
    const unlock = acquireLock(this.state.directory, lockName);
    if (!unlock) {
      this.status(local, "failed", "PROJECT_BUSY");
      return { accepted: true };
    }
    const execution: Execution = {
      local,
      unlock,
      pending: new Map(),
      cancelled: false,
      finished: false,
      summary: "",
      preview: "",
      items: new Map(),
      conversation: new ConversationRecorder(
        task.id,
        (entry) => {
          const value = this.store.recordActivity(binding, entry);
          this.changedFor(local, {
            id: crypto.randomUUID(),
            taskId: value.taskId,
            kind: "activity",
            entry: value,
          });
          return value;
        },
        isDesktopBinding(binding) ? 250 : 1000,
        (totals) => {
          this.store.recordTokenUsage(local, totals);
        },
      ),
      inputs: [],
      operation: Promise.resolve(),
      ready: false,
      turnActive: false,
      turnId: "",
      interrupting: false,
    };
    this.active.set(task.id, execution);
    this.status(local, "running");
    void this.run(execution, executable, directory).catch(() =>
      this.finish(execution, "failed", "AGENT_PROTOCOL_FAILED"),
    );
    return { accepted: true };
  }
  private serial(execution: Execution, operation: () => Promise<void>) {
    const next = execution.operation.then(async () => {
      if (!execution.finished) await operation();
    });
    execution.operation = next.catch(() =>
      this.finish(execution, "failed", "AGENT_PROTOCOL_FAILED"),
    );
    return execution.operation;
  }
  private inputStatus(
    execution: Execution,
    entry: TaskInput,
    status: TaskInput["status"],
    code?: TaskInput["code"],
  ) {
    if (execution.finished) return;
    Object.assign(
      entry,
      this.store.recordActivity(execution.local.binding, {
        ...entry,
        status,
        ...(code ? { code } : {}),
        updatedAt: new Date().toISOString(),
      }),
    );
    this.changed();
  }
  private expireInput(execution: Execution, entry: TaskInput) {
    if (
      execution.finished ||
      !execution.turnActive ||
      !execution.interrupting ||
      entry.status !== "sending" ||
      !execution.inputs.some((input) => input.id === entry.id)
    )
      return;
    clearTimeout(execution.interruptTimer);
    delete execution.interruptTimer;
    execution.inputs = execution.inputs.filter((input) => input.id !== entry.id);
    this.inputStatus(execution, entry, "failed", "INPUT_DELIVERY_FAILED");
    this.finish(execution, "interrupted", "INPUT_DELIVERY_FAILED");
  }
  private async nextInput(execution: Execution) {
    if (execution.finished || execution.turnActive || !execution.sendTurn) return false;
    const entry = execution.inputs.shift();
    if (!entry) return false;
    this.inputStatus(execution, entry, "sending");
    try {
      await execution.sendTurn(entry.text);
      this.inputStatus(execution, entry, "sent");
    } catch {
      this.inputStatus(execution, entry, "failed", "INPUT_DELIVERY_FAILED");
      this.finish(execution, "failed", "AGENT_PROTOCOL_FAILED");
    }
    return true;
  }
  private async ask(
    execution: Execution,
    kind: HumanRequest["kind"],
    title: string,
    body: string,
    questions: HumanRequest["questions"] = [],
    deadline?: number,
  ): Promise<HumanDecision> {
    if (execution.cancelled || execution.finished) return { type: "deny", note: "Task stopped" };
    if (
      body.length > 128_000 ||
      Buffer.byteLength(JSON.stringify({ body, questions })) > 192 * 1024
    )
      return {
        type: "deny",
        note: "Request exceeds remote approval limits. No approval was granted.",
      };
    const expiresAt = new Date(Math.min(Date.now() + 600_000, deadline ?? Infinity)).toISOString();
    const request = humanRequestSchema.parse({
      id: crypto.randomUUID(),
      taskId: execution.local.task.id,
      kind,
      title: taskText(title, 500),
      body: taskText(body, 128_000),
      questions,
      expiresAt,
      status: "pending",
      decision: null,
    });
    this.status(execution.local, "waiting");
    this.store.request(execution.local.binding, request);
    const answer = new Promise<HumanDecision>((resolve) => {
      const timer = setTimeout(
        () => {
          execution.pending.delete(request.id);
          this.store.request(execution.local.binding, { ...request, status: "expired" });
          this.changed();
          resolve({ type: "deny", note: "Request expired" });
        },
        Math.max(1, Date.parse(expiresAt) - Date.now()),
      );
      execution.pending.set(request.id, { request, resolve, timer });
    });
    this.changed(isDesktopBinding(execution.local.binding) ? request.id : undefined);
    const result = await answer;
    if (!execution.cancelled && !execution.finished) this.status(execution.local, "running");
    return result;
  }
  private async run(
    execution: Execution,
    executable: string,
    directory: string,
    continuationPrompt?: string,
  ) {
    const task = execution.local.task;
    const parent = task.parentTaskId ? this.store.get(task.parentTaskId) : undefined;
    if (
      task.parentTaskId &&
      (!parent?.sessionId ||
        parent.binding !== execution.local.binding ||
        parent.task.projectId !== task.projectId ||
        parent.task.provider !== task.provider)
    )
      throw new LocalError("SESSION_UNAVAILABLE", "Previous session is unavailable");
    if (task.provider === "codex") {
      const runner = new JsonProcess(
        executable,
        ["app-server", "--listen", "stdio://"],
        directory,
        (message) => {
          if (execution.finished || execution.process !== runner) return;
          const method = text(message.method);
          const params = object(message.params);
          execution.conversation.codex(method, params);
          if (method === "turn/started") execution.turnId = text(object(params.turn).id, 500);
          if (method === "item/started") {
            const item = object(params.item);
            execution.items.set(text(item.id, 500), item);
            if (item.type === "agentMessage") {
              execution.summary = "";
              execution.preview = "";
            }
          } else if (method === "item/completed" && object(params.item).type === "agentMessage") {
            execution.summary = text(object(params.item).text, 32_000);
            execution.preview = text(object(params.item).text, 128_001);
          } else if (message.id !== undefined && method.includes("requestApproval")) {
            const item = execution.items.get(text(params.itemId, 500)) ?? object(params.item);
            void this.ask(
              execution,
              "permission",
              text(params.reason, 500) || "Codex",
              JSON.stringify(
                {
                  command: params.command,
                  changes: params.changes ?? item.changes,
                  permissions: params.permissions,
                },
                null,
                2,
              ),
            )
              .then((decision) =>
                runner.send({
                  id: message.id,
                  result:
                    method === "item/permissions/requestApproval"
                      ? {
                          permissions: decision.type === "allow" ? params.permissions : {},
                          scope: "turn",
                        }
                      : { decision: decision.type === "allow" ? "accept" : "decline" },
                }),
              )
              .catch(() => this.finish(execution, "failed", "AGENT_PROTOCOL_FAILED"));
          } else if (
            message.id !== undefined &&
            (method === "item/tool/requestUserInput" || method === "tool/requestUserInput")
          ) {
            const questions = Array.isArray(params.questions)
              ? params.questions.map((q: unknown) => {
                  const question = object(q);
                  return {
                    id: text(question.id, 300),
                    text: text(question.question, 8000),
                    multiSelect: false,
                    options: Array.isArray(question.options)
                      ? question.options.map((o: unknown) => ({
                          label: text(object(o).label, 1000),
                          description: text(object(o).description, 8000),
                        }))
                      : [],
                  };
                })
              : [];
            void this.ask(
              execution,
              "question",
              "Codex",
              "",
              questions,
              typeof params.autoResolutionMs === "number"
                ? Date.now() + params.autoResolutionMs
                : undefined,
            )
              .then((decision) =>
                runner.send({
                  id: message.id,
                  result: {
                    answers:
                      decision.type === "answer"
                        ? Object.fromEntries(
                            Object.entries(decision.answers).map(([key, answers]) => [
                              key,
                              { answers },
                            ]),
                          )
                        : {},
                  },
                }),
              )
              .catch(() => this.finish(execution, "failed", "AGENT_PROTOCOL_FAILED"));
          } else if (message.id !== undefined && method)
            runner.send({
              id: message.id,
              error: { code: -32601, message: "Unsupported host request" },
            });
          else if (method === "item/agentMessage/delta") {
            execution.summary = taskText(
              execution.summary + text(params.delta, 32_000),
              32_000,
              true,
            );
            execution.preview = taskText(execution.preview + text(params.delta, 128_001), 128_001);
          } else if (method === "turn/completed") {
            const turn = object(params.turn);
            void this.serial(execution, async () => {
              clearTimeout(execution.interruptTimer);
              delete execution.interruptTimer;
              execution.turnActive = false;
              execution.conversation.endTurn(
                turn.status === "completed" ? "complete" : "interrupted",
              );
              if (turn.status === "completed" && task.mode === "plan") {
                const decision = await this.ask(execution, "plan", "Codex", execution.preview);
                if (execution.finished) return;
                if (decision.type !== "allow") {
                  if (decision.type === "deny" && decision.note.trim()) {
                    await execution.sendTurn!(decision.note);
                  } else this.finish(execution, "cancelled");
                  return;
                }
                task.mode = "run";
                this.store.put(execution.local);
                await execution.sendTurn!(
                  "Implement the approved plan. Modify and validate only; do not commit, merge or push.",
                );
                return;
              }
              if (turn.status === "completed" && (await this.nextInput(execution))) return;
              this.finish(
                execution,
                turn.status === "completed"
                  ? "succeeded"
                  : turn.status === "interrupted"
                    ? "cancelled"
                    : "failed",
                execution.summary,
              );
            });
          }
        },
      );
      execution.process = runner;
      void runner.completed.then(
        () => {
          if (!execution.finished && execution.process === runner)
            this.finish(execution, execution.cancelled ? "cancelled" : "failed", "AGENT_EXITED");
        },
        () => {
          if (execution.process === runner && !execution.awaitingPlan)
            this.finish(execution, "failed", "AGENT_PROTOCOL_FAILED");
        },
      );
      await runner.request("initialize", {
        clientInfo: { name: "raypx", title: "Raypx", version: "0.1.0" },
        capabilities: { experimentalApi: true },
      });
      runner.send({ method: "initialized", params: {} });
      const response = await runner.request(parent ? "thread/resume" : "thread/start", {
        ...(parent ? { threadId: parent.sessionId } : {}),
        cwd: directory,
        approvalPolicy: "on-request",
        sandbox: task.mode === "plan" ? "read-only" : "workspace-write",
      });
      execution.local.sessionId = text(object(response.thread).id, 500);
      this.store.put(execution.local);
      execution.conversation.setTokenBaseline(
        this.store.tokenUsage(execution.local.sessionId) ??
          execution.local.tokenUsage ??
          (parent
            ? parent.tokenUsage
            : { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0 }),
      );
      execution.sendTurn = async (prompt) => {
        execution.turnActive = true;
        execution.turnId = "";
        execution.summary = "";
        execution.preview = "";
        execution.items.clear();
        execution.conversation.startTurn();
        const turnResponse = await runner.request("turn/start", {
          threadId: execution.local.sessionId,
          input: [{ type: "text", text: prompt }],
          sandboxPolicy:
            task.mode === "plan"
              ? { type: "readOnly" }
              : { type: "workspaceWrite", writableRoots: [directory], networkAccess: false },
        });
        execution.turnId = text(object(turnResponse.turn).id, 500) || execution.turnId;
        execution.conversation.setTurnId(execution.turnId);
      };
      await this.serial(execution, async () => {
        await execution.sendTurn!(
          task.prompt +
            (task.mode === "plan"
              ? "\nInspect the project and propose an implementation plan. Do not modify files before the plan is approved."
              : "\nModify and validate only. Do not commit, merge, or push unless separately instructed by the user."),
        );
        execution.ready = true;
      });
    } else {
      execution.planRequestHandled = false;
      this.ensureHookServer();
      const token = crypto.randomUUID() + crypto.randomUUID();
      this.hookTokens.set(task.id, token);
      const hook = {
        type: "http",
        url: `http://127.0.0.1:${this.server!.port}/hook/${task.id}`,
        headers: { Authorization: "Bearer $RAYPX_AGENT_HOOK_TOKEN" },
        allowedEnvVars: ["RAYPX_AGENT_HOOK_TOKEN"],
        timeout: 610,
        onFailure: "block",
      };
      const settings = {
        hooks: {
          PermissionRequest: [{ matcher: ".*", hooks: [hook] }],
          PreToolUse: [{ matcher: "AskUserQuestion|ExitPlanMode", hooks: [hook] }],
        },
      };
      const args = [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--replay-user-messages",
        "--verbose",
        "--permission-mode",
        task.mode === "plan" ? "plan" : "manual",
        "--settings",
        JSON.stringify(settings),
      ];
      const sessionId = execution.local.sessionId ?? parent?.sessionId;
      if (sessionId) args.push("--resume", sessionId);
      // Prompt text is written on stdin rather than exposed in process arguments.
      const runner = new JsonProcess(
        executable,
        args,
        directory,
        (message) => {
          if (execution.finished || execution.process !== runner) return;
          execution.conversation.claude(message);
          if (message.type === "system" && typeof message.session_id === "string") {
            execution.local.sessionId = message.session_id;
            this.store.put(execution.local);
          }
          if (message.type === "result") {
            const interrupted = message.is_error === true && execution.interrupting;
            void this.serial(execution, async () => {
              clearTimeout(execution.interruptTimer);
              delete execution.interruptTimer;
              execution.turnActive = false;
              execution.interrupting = false;
              execution.conversation.endTurn(
                message.is_error === true || interrupted ? "interrupted" : "complete",
              );
              execution.summary = text(message.result, 32_000);
              if (
                (message.is_error !== true || interrupted) &&
                (interrupted ||
                  task.mode !== "plan" ||
                  execution.inputs.some(
                    (entry) => entry.mode === "steer" && entry.status === "sending",
                  )) &&
                (await this.nextInput(execution))
              )
                return;
              // Headless Claude may return a plan without exposing ExitPlanMode.
              // The host must still offer approval and resume the same session.
              if (
                message.is_error !== true &&
                !interrupted &&
                task.mode === "plan" &&
                !execution.planRequestHandled
              ) {
                execution.awaitingPlan = true;
                await this.continueClaudePlan(
                  execution,
                  runner,
                  executable,
                  directory,
                  text(message.result, 128_001),
                );
                return;
              }
              this.finish(
                execution,
                message.is_error === true ? "failed" : "succeeded",
                execution.summary,
              );
            });
          }
        },
        { ...process.env, RAYPX_AGENT_HOOK_TOKEN: token },
      );
      execution.process = runner;
      execution.sendTurn = async (prompt) => {
        execution.turnActive = true;
        execution.summary = "";
        execution.conversation.startTurn();
        runner.send({
          type: "user",
          uuid: crypto.randomUUID(),
          ...(execution.local.sessionId ? { session_id: execution.local.sessionId } : {}),
          message: { role: "user", content: prompt },
          parent_tool_use_id: null,
          client_composed: true,
        });
      };
      await execution.sendTurn(
        (continuationPrompt ?? task.prompt) +
          "\nModify and validate only. Do not commit, merge, or push unless separately instructed by the user.",
      );
      execution.ready = true;
      void runner.completed.then(
        () => {
          if (!execution.finished && execution.process === runner && !execution.awaitingPlan)
            this.finish(execution, execution.cancelled ? "cancelled" : "failed", "AGENT_EXITED");
        },
        () => {
          if (execution.process === runner && !execution.awaitingPlan)
            this.finish(execution, "failed", "AGENT_PROTOCOL_FAILED");
        },
      );
    }
  }
  private async continueClaudePlan(
    execution: Execution,
    runner: JsonProcess,
    executable: string,
    directory: string,
    plan: string,
  ) {
    await runner.kill();
    await runner.completed.catch(() => {});
    if (execution.finished) return;
    if (execution.process === runner) delete execution.process;
    if (
      !execution.local.sessionId ||
      !plan.trim() ||
      plan.length > 128_000 ||
      Buffer.byteLength(JSON.stringify({ body: plan, questions: [] })) > 192 * 1024
    ) {
      this.finish(execution, "failed", "AGENT_PROTOCOL_FAILED");
      return;
    }
    const answer = this.ask(execution, "plan", "Claude Code", plan);
    const request = [...execution.pending.values()].find(
      (item) => item.request.kind === "plan",
    )?.request;
    const decision = await answer;
    if (execution.finished) return;
    const applied =
      request &&
      this.store.requests(execution.local.binding).find((item) => item.id === request.id);
    if (applied?.status !== "applied") {
      this.finish(execution, "cancelled");
      return;
    }
    let prompt: string;
    if (decision.type === "allow") {
      execution.local.task.mode = "run";
      prompt =
        "Implement the approved plan. Modify and validate only; do not commit, merge or push.";
    } else if (decision.type === "deny" && decision.note.trim()) {
      prompt = decision.note;
    } else {
      this.finish(execution, "cancelled");
      return;
    }
    execution.summary = "";
    execution.preview = "";
    execution.awaitingPlan = false;
    this.store.put(execution.local);
    await this.run(execution, executable, directory, prompt);
  }
  private ensureHookServer() {
    this.server ??= Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      idleTimeout: 0,
      fetch: async (request) => {
        const id = new URL(request.url).pathname.split("/")[2] ?? "";
        const execution = this.active.get(id);
        if (
          request.method !== "POST" ||
          !execution ||
          request.headers.get("authorization") !== `Bearer ${this.hookTokens.get(id)}`
        )
          return new Response(null, { status: 403 });
        try {
          if (Number(request.headers.get("content-length") ?? 0) > 256 * 1024)
            return new Response(null, { status: 413 });
          const raw = await request.text();
          if (Buffer.byteLength(raw) > 256 * 1024) return new Response(null, { status: 413 });
          const input = object(JSON.parse(raw));
          const name = text(input.tool_name, 500);
          const tool = object(input.tool_input);
          const question = name === "AskUserQuestion";
          const plan = name === "ExitPlanMode";
          if (plan) execution.planRequestHandled = true;
          const questions =
            question && Array.isArray(tool.questions)
              ? tool.questions.map((item: unknown, index: number) => {
                  const q = object(item);
                  return {
                    id: String(index),
                    text: text(q.question, 8000),
                    multiSelect: q.multiSelect === true,
                    options: Array.isArray(q.options)
                      ? q.options.map((option: unknown) => ({
                          label: text(object(option).label, 1000),
                          description: text(object(option).description, 8000),
                        }))
                      : [],
                  };
                })
              : [];
          const decision = await this.ask(
            execution,
            question ? "question" : plan ? "plan" : "permission",
            name,
            plan
              ? typeof tool.plan === "string"
                ? tool.plan
                : ""
              : question
                ? ""
                : JSON.stringify(tool, null, 2),
            questions,
          );
          if (plan && decision.type === "allow") {
            execution.local.task.mode = "run";
            this.store.put(execution.local);
          }
          if (input.hook_event_name === "PermissionRequest")
            return Response.json({
              hookSpecificOutput: {
                hookEventName: "PermissionRequest",
                decision:
                  decision.type === "allow"
                    ? { behavior: "allow" }
                    : {
                        behavior: "deny",
                        message: decision.type === "deny" ? decision.note : "Denied",
                      },
              },
            });
          const updatedInput =
            question && decision.type === "answer"
              ? {
                  ...tool,
                  answers: Object.fromEntries(
                    questions.map((q) => [q.text, (decision.answers[q.id] ?? []).join(", ")]),
                  ),
                }
              : tool;
          return Response.json({
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: decision.type === "deny" ? "deny" : "allow",
              permissionDecisionReason: decision.type === "deny" ? decision.note : "",
              updatedInput,
            },
          });
        } catch {
          return Response.json({ continue: false, stopReason: "Approval unavailable" });
        }
      },
    });
  }
  private cancel(execution: Execution) {
    execution.cancelled = true;
    this.finish(execution, "cancelled");
  }
  private finish(execution: Execution, status: AgentTask["status"], summary = "") {
    if (execution.finished) return;
    execution.finished = true;
    clearTimeout(execution.interruptTimer);
    execution.conversation.stop(status === "succeeded" ? "complete" : "interrupted");
    for (const item of execution.pending.values()) {
      clearTimeout(item.timer);
      item.resolve({ type: "deny", note: "Task stopped" });
    }
    execution.pending.clear();
    const completion = (async () => {
      await execution.process?.kill();
      await execution.process?.completed.catch(() => {});
      execution.unlock();
      this.hookTokens.delete(execution.local.task.id);
      this.active.delete(execution.local.task.id);
      this.status(execution.local, status, summary);
    })();
    this.completions.add(completion);
    void completion.finally(() => this.completions.delete(completion));
  }
  async detach(binding: string) {
    this.bindingVersions.set(binding, (this.bindingVersions.get(binding) ?? 0) + 1);
    for (const execution of this.active.values())
      if (execution.local.binding === binding) this.cancel(execution);
    await Promise.allSettled(this.completions);
    return { detached: true };
  }
  async close() {
    this.closing = true;
    const executions = [...this.active.values()];
    for (const execution of executions) this.cancel(execution);
    await Promise.allSettled(executions.flatMap((e) => (e.process ? [e.process.completed] : [])));
    await Promise.allSettled(this.completions);
    await this.server?.stop(true);
    this.store.close();
  }
}
