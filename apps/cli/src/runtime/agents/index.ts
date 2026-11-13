import type { PiExecutionServices } from "./pi/ports.js";
import { createProviderRegistry } from "./infrastructure/providers/builtins.js";
import type { ProviderRegistry } from "./application/providers.js";
import { ClaudeApprovalServer } from "./infrastructure/claude-hook.js";
import type { RecordDiagnostic } from "../../diagnostics.js";
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
import { type StateStore } from "../state/index.js";
import { LocalError } from "../errors.js";
import { AgentStore } from "./store.js";
import { desktopBinding } from "./model.js";
import { ExecutionCoordinator } from "./application/coordinator.js";
import { LocalExecutionProjects } from "./infrastructure/projects.js";
import manifest from "../../../package.json";

import { AgentCommandService } from "./application/commands.js";
import { AgentQueries } from "./application/queries.js";
import { cryptoIds, systemClock, type Clock, type Ids } from "./domain/ports.js";
import { DecisionRejected } from "./domain/decider.js";
export class AgentRuntime {
  readonly instanceId: string;
  private readonly clock: Clock;
  private readonly ids: Ids;
  private readonly store: AgentStore;
  private readonly queries: AgentQueries;
  private readonly providers: ProviderRegistry;
  private readonly execution: ExecutionCoordinator;
  private readonly projectsService: LocalExecutionProjects;
  private readonly commands: AgentCommandService;
  private readonly starting = new Map<string, ReturnType<ExecutionCoordinator["start"]>>();
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
      /** Determinism ports for tests that compare replayed or projected output. */
      clock?: Clock;
      transport?: import("./harness/transport.js").TransportFactory;
      /** Tests supply explicit executables and never discover a real installation. */
      explicitExecutables?: boolean;
      /** Bound for one provider `--version` probe; tests on busy hosts raise it. */
      discoveryTimeoutMs?: number;
      ids?: Ids;
      resolveContext?: (
        selection: TaskContextSelection,
        target: TaskContextTarget,
        prompt: string,
      ) => Promise<TaskContextSnapshot>;
    } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.ids = options.ids ?? cryptoIds;
    this.instanceId = this.ids.generate();
    this.store = new AgentStore(state.db, 4096, 8 * 1024 * 1024, this.clock, this.ids);
    this.providers = createProviderRegistry(options.executables, options.pi, options.transport, {
      explicitOnly: options.explicitExecutables,
      timeoutMs: options.discoveryTimeoutMs,
    });
    this.projectsService = new LocalExecutionProjects(state, this.store);
    const hooks = new ClaudeApprovalServer((id) => this.execution.get(id));
    this.execution = new ExecutionCoordinator(
      this.store,
      this.providers,
      this.projectsService,
      hooks,
      changed,
      { ...options, clock: this.clock, ids: this.ids },
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
        decide: async (binding, id, taskId, requestId, decision) => {
          const result = this.store.submit(
            {
              type: "decision",
              binding,
              commandId: id,
              taskId,
              requestId,
              decision,
              recordDecided: true,
            },
            this.execution.live(),
          );
          this.execution.runEffects(result.effects);
          this.store.receipt(id);
          return result.result;
        },
      },
      () => this.execution.isClosing(),
      options.resolveContext,
      this.clock,
    );

    // Startup sweep: effects addressed a process that no longer exists, so they are
    // abandoned rather than replayed, and every task still active is interrupted.
    this.store.recoverEffects();
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
      lastSeenAt: this.clock.now().toISOString(),
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
      expiresAt: new Date(this.clock.now().getTime() + 15_000).toISOString(),
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
  activeTaskIds() {
    return this.store.tasks({ activeOnly: true }).map(({ task }) => task.id);
  }
  async stopTasks(ids: readonly string[]) {
    await Promise.all(
      ids.map(async (id) => {
        const local = this.store.get(id);
        if (local) await this.execution.cancelTask(local, this.starting.get(id));
      }),
    );
    if (
      ids.some((id) => {
        const local = this.store.get(id);
        return local && activeTaskStatuses.includes(local.task.status);
      })
    )
      throw new LocalError("QUIT_TASKS_NOT_STOPPED", "Some tasks are still in progress");
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
        if (value.binding === binding || value.expires < this.clock.now().getTime())
          this.snapshots.delete(key);
      id = this.ids.generate();
      const snapshot = this.store.snapshot(binding);
      this.snapshots.set(id, {
        binding,
        expires: this.clock.now().getTime() + 120_000,
        ...snapshot,
      });
    }
    const snapshot = this.snapshots.get(id);
    if (!snapshot || snapshot.binding !== binding || snapshot.expires < this.clock.now().getTime())
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
  /**
   * Device commands are a thin shell: the decider validates against committed
   * records and live facts, the sink commits, then the worker runs the effects.
   * A device command that no longer applies is acknowledged without a change.
   */
  async command(binding: string, command: DeviceCommand) {
    if (this.store.seen(command.id)) return { accepted: true };
    if (command.type === "start")
      return this.start(binding, command.id, command.task, command.deadline);
    const execution = this.execution.get(command.taskId);
    if (execution && execution.local.binding !== binding)
      throw new LocalError("NOT_FOUND", "Task does not belong to binding");
    if (command.type === "cancel") {
      // Cancellation drains through the execution's own state machine today.
      if (execution) execution.cancel();
    } else if (execution) {
      try {
        const decision = this.store.submit(
          {
            type: "decision",
            binding,
            commandId: command.id,
            taskId: command.taskId,
            requestId: command.requestId,
            decision: command.decision,
          },
          this.execution.live(),
        );
        this.execution.runEffects(decision.effects);
      } catch (error) {
        if (!(error instanceof DecisionRejected)) throw error;
      }
    }
    this.store.receipt(command.id);
    return { accepted: true };
  }
  start(...args: Parameters<ExecutionCoordinator["start"]>) {
    const id = args[2].id;
    const operation = this.execution.start(...args);
    this.starting.set(id, operation);
    const done = () => {
      if (this.starting.get(id) === operation) this.starting.delete(id);
    };
    void operation.then(done, done);
    return operation;
  }
  detach(binding: string) {
    return this.execution.detach(binding);
  }
  close() {
    return this.execution.close();
  }
}
