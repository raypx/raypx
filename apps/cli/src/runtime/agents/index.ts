import type { RecordDiagnostic } from "../../diagnostics";
import { existsSync, realpathSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import {
  taskText,
  activeTaskStatuses,
  type AgentTask,
  type AgentProvider,
  type AgentCapability,
  type AgentEvent,
  type DeviceProject,
  type DeviceCommand,
  type RelayCommand,
  type SnapshotRecord,
  type RelayRequest,
  type SyncDevice,
  type TaskInput,
  type TaskChange,
  validDecision,
  TaskContextError,
  type TaskContextSelection,
  type TaskContextTarget,
  type TaskContextSnapshot,
} from "@raypx/contracts/tasks";
import { type StateStore, acquireLock } from "../state";
import { LocalError } from "../errors";
import { AgentStore, desktopBinding, isDesktopBinding, type LocalAgentTask } from "./store";
import { ManagedExecution, initialExecutionPrompt, executionSession } from "./harness/execution";
import { ConversationRecorder } from "./activity";
import manifest from "../../../package.json";
import { ContextError } from "@raypx/memory";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";

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
  private readonly active = new Map<string, ManagedExecution>();
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
      resolveContext?: (
        selection: TaskContextSelection,
        target: TaskContextTarget,
        prompt: string,
      ) => Promise<TaskContextSnapshot>;
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
          code:
            error instanceof LocalError ||
            error instanceof TaskContextError ||
            error instanceof ContextError
              ? error.code
              : "AGENT_UNAVAILABLE",
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
        code:
          error instanceof LocalError ||
          error instanceof TaskContextError ||
          error instanceof ContextError
            ? error.code
            : "AGENT_UNAVAILABLE",
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
      const requestInput = request.input;
      let task: AgentTask;
      const now = new Date().toISOString();
      if (request.method === "tasks.create") {
        const { contextSelection, ...input } = request.input;
        let context = command.context;
        if (!context && contextSelection?.sources.length) {
          if (binding !== desktopBinding(LOCAL_WORKSPACE_ID) || !this.options.resolveContext)
            throw new ContextError("CONTEXT_UNAVAILABLE");
          context = await this.options.resolveContext(
            contextSelection,
            {
              deviceId: input.deviceId,
              projectId: input.projectId,
            },
            input.prompt,
          );
        }
        task = {
          ...input,
          ...(context ? { context } : {}),
          parentTaskId: null,
          status: "pending",
          summary: "",
          createdAt: now,
          updatedAt: now,
        };
      } else {
        const parent = getTask(request.input.parentTaskId);
        if (activeTaskStatuses.includes(parent.task.status))
          throw new LocalError("PROJECT_BUSY", "Parent task is still active");
        task = {
          ...parent.task,
          id: requestInput.id,
          parentTaskId: parent.task.id,
          prompt: requestInput.prompt,
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
      if (!execution) throw new LocalError("TASK_STOPPED", "Task stopped");
      return execution.enqueue(request.input);
    }
    if (request.method === "tasks.cancel") {
      const local = getTask(request.input.id);
      if (activeTaskStatuses.includes(local.task.status)) {
        this.cancelledStarts.add(local.task.id);
        const execution = this.active.get(local.task.id);
        if (execution) {
          this.status(local, "cancelling");
          execution.cancel();
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
    if (!execution?.hasPending(requestValue.id))
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
      if (execution) execution.cancel();
    } else if (execution) {
      execution.applyDecision(command.requestId, command.decision);
    }
    this.store.receipt(command.id);
    return { accepted: true };
  }
  async start(binding: string, commandId: string, task: AgentTask, deadline: string) {
    if (this.store.seen(commandId)) return { accepted: true };
    if (this.closing) throw new LocalError("CLOSING", "Agent host is closing");
    const version = this.bindingVersions.get(binding) ?? 0;
    const local: LocalAgentTask = { task: { ...task }, binding, sessionId: null };
    const parent = task.parentTaskId ? this.store.get(task.parentTaskId) : undefined;
    initialExecutionPrompt(task, undefined, Boolean(executionSession(local, parent)));
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
    const execution = new ManagedExecution(
      local,
      new ConversationRecorder(
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
      unlock,
      this.store,
      {
        status: (status, summary) => this.status(local, status, summary),
        changed: (pendingRequest) => this.changed(pendingRequest),
        resolved: (requestId) =>
          this.emit(local, {
            id: crypto.randomUUID(),
            taskId: local.task.id,
            kind: "resolved",
            requestId,
          }),
        hook: () => {
          this.ensureHookServer();
          const token = crypto.randomUUID() + crypto.randomUUID();
          this.hookTokens.set(task.id, token);
          return { url: `http://127.0.0.1:${this.server!.port}/hook/${task.id}`, token };
        },
        track: (completion) => {
          this.completions.add(completion);
          void completion.finally(() => this.completions.delete(completion));
        },
        ended: () => {
          this.hookTokens.delete(task.id);
          this.active.delete(task.id);
        },
      },
    );
    this.active.set(task.id, execution);
    this.status(local, "running");
    void execution
      .run(executable, directory)
      .catch((error: unknown) =>
        execution.finish(
          "failed",
          error instanceof TaskContextError ||
            (error instanceof LocalError && error.code === "SESSION_UNAVAILABLE")
            ? error.code
            : "AGENT_PROTOCOL_FAILED",
        ),
      );
    return { accepted: true };
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
          if (plan) execution.markPlanHandled();
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
          const decision = await execution.ask(
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
          if (plan && decision.type === "allow") execution.approveHookPlan();
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
  async detach(binding: string) {
    this.bindingVersions.set(binding, (this.bindingVersions.get(binding) ?? 0) + 1);
    for (const execution of this.active.values())
      if (execution.local.binding === binding) execution.cancel();
    await Promise.allSettled(this.completions);
    return { detached: true };
  }
  async close() {
    this.closing = true;
    const executions = [...this.active.values()];
    for (const execution of executions) execution.cancel();
    await Promise.allSettled(this.completions);
    await this.server?.stop(true);
    this.store.close();
  }
}
