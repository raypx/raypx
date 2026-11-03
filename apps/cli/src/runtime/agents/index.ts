import type { PiExecutionServices } from "./pi/ports";
import { createProviderRegistry } from "./infrastructure/providers/builtins";
import type { ProviderRegistry } from "./application/providers";
import { ClaudeApprovalServer } from "./infrastructure/claude-hook";
import type { RecordDiagnostic } from "../../diagnostics";
import { hostname } from "node:os";
import {
  type DeviceCommand,
  type RelayCommand,
  type SnapshotRecord,
  type RelayRequest,
  type SyncDevice,
  type TaskChange,
} from "@raypx/contracts/tasks";
import {
  activeTaskStatuses,
  type AgentProvider,
  type AgentCapability,
  type TaskContextSelection,
  type TaskContextTarget,
  type TaskContextSnapshot,
} from "@raypx/core/tasks";
import { type StateStore } from "../state";
import { LocalError } from "../errors";
import { AgentStore } from "./store";
import { desktopBinding } from "./model";
import { ExecutionCoordinator } from "./application/execution";
import { LocalExecutionProjects } from "./infrastructure/projects";
import manifest from "../../../package.json";

import { AgentCommandService } from "./application/commands";
import { AgentQueries } from "./application/queries";
export class AgentRuntime {
  readonly instanceId = crypto.randomUUID();
  private readonly store: AgentStore;
  private readonly queries: AgentQueries;
  private readonly providers: ProviderRegistry;
  private readonly execution: ExecutionCoordinator;
  private readonly projectsService: LocalExecutionProjects;
  private readonly commands: AgentCommandService;
  private readonly snapshots = new Map<
    string,
    { binding: string; expires: number; sequence: number; records: SnapshotRecord[] }
  >();
  constructor(
    private readonly state: StateStore,
    // A pending request id is passed only for local work; relay delivery notifies separately.
    private readonly changed: (pendingRequest?: string, change?: TaskChange) => void,
    options: {
      executables?: Partial<Record<AgentProvider, string>>;
      pi?: PiExecutionServices;
      assertInstance?: () => Promise<void>;
      recordDiagnostic?: RecordDiagnostic;
      /** How long an interrupted turn may run before its pending input expires. */
      interruptTimeoutMs?: number;
      environment?: () => Record<string, string | undefined>;
      resolveContext?: (
        selection: TaskContextSelection,
        target: TaskContextTarget,
        prompt: string,
      ) => Promise<TaskContextSnapshot>;
    } = {},
  ) {
    this.store = new AgentStore(state.db);
    this.providers = createProviderRegistry(options.executables, options.pi);
    this.projectsService = new LocalExecutionProjects(state, this.store);
    const hooks = new ClaudeApprovalServer((id) => this.execution.get(id));
    this.execution = new ExecutionCoordinator(
      this.store,
      this.providers,
      this.projectsService,
      hooks,
      changed,
      options,
    );
    this.queries = new AgentQueries(this.store, (local) => this.providers.inspect(local));
    this.commands = new AgentCommandService(
      this.store,
      {
        get: (id) => this.execution.get(id),
        start: (...args) => this.start(...args),
        input: (id, input) => {
          const execution = this.execution.get(id);
          if (!execution) throw new LocalError("TASK_STOPPED", "Task stopped");
          return execution.enqueue(input);
        },
        cancel: (local, starting) => this.execution.cancelTask(local, starting),
        decide: (binding, id, taskId, requestId, decision) =>
          this.command(binding, { id, type: "decision", taskId, requestId, decision }),
      },
      () => this.execution.isClosing(),
      options.resolveContext,
    );

    for (const local of this.store.tasks({ activeOnly: true }))
      this.execution.status(local, "interrupted", undefined, "HOST_RESTARTED");
  }
  validateProject(target: TaskContextTarget) {
    this.projectsService.validate(target);
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
  localTasks(...args: Parameters<AgentQueries["localTasks"]>) {
    return this.queries.localTasks(...args);
  }
  localTask(...args: Parameters<AgentQueries["localTask"]>) {
    const { continuation, ...detail } = this.queries.localTask(...args);
    return { ...detail, ...(continuation ? { piContinuation: continuation } : {}) };
  }
  localApprovals(...args: Parameters<AgentQueries["localApprovals"]>) {
    return this.queries.localApprovals(...args);
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
      tasks = this.store.tasks({ binding }).map((local) => local.task),
      kept = new Set(
        tasks
          .filter((task) => activeTaskStatuses.includes(task.status) || this.execution.has(task.id))
          .flatMap((task) => [task.id, ...(task.parentTaskId ? [task.parentTaskId] : [])]),
      ),
      removed = tasks.filter((task) => !kept.has(task.id)).map((task) => task.id);
    this.store.forget(binding, removed, this.commands.pendingIds());
    this.changed();
    return { removed: removed.length };
  }
  localDetach(accountId: string) {
    return this.detach(desktopBinding(accountId));
  }
  async capabilities(): Promise<AgentCapability[]> {
    return this.providers.discover();
  }
  async remoteProjects() {
    return (await this.projects()).map((project) => ({
      ...project,
      providers: project.providers.filter((provider) => this.providers.allowsRemote(provider)),
    }));
  }
  async remoteCapabilities() {
    return (await this.capabilities()).map((capability) =>
      this.providers.allowsRemote(capability.provider)
        ? capability
        : { ...capability, available: false, reason: "unsupported" as const, inputModes: [] },
    );
  }
  configure(rootId: string, providers: AgentProvider[]) {
    this.state.root(rootId);
    this.store.configure(rootId, providers);
    this.changed();
    return { configured: true };
  }
  managesSession(provider: AgentProvider, sessionId: string) {
    return this.store.hasActiveSession(provider, sessionId);
  }
  projectProviders(rootId: string) {
    return this.store.projects().find((project) => project.id === rootId)?.providers ?? [];
  }
  projects() {
    return this.projectsService.list();
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
      const snapshot = this.store.snapshot(binding);
      this.snapshots.set(id, {
        binding,
        expires: Date.now() + 120_000,
        ...snapshot,
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
    if (command.request.method === "observed.decide")
      return { ok: false as const, code: "INVALID_METHOD" };
    return this.commands.remote(binding, { ...command, request: command.request });
  }
  ack(binding: string, ids: string[]) {
    this.store.ack(binding, ids);
    return { accepted: true };
  }
  async command(binding: string, command: DeviceCommand) {
    if (this.store.seen(command.id)) return { accepted: true };
    if (command.type === "start")
      return this.start(binding, command.id, command.task, command.deadline);
    const execution = this.execution.get(command.taskId);
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
  start(...args: Parameters<ExecutionCoordinator["start"]>) {
    return this.execution.start(...args);
  }
  detach(binding: string) {
    return this.execution.detach(binding);
  }
  close() {
    return this.execution.close();
  }
}
