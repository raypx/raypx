import type {
  ExecutionRepository,
  ExecutionTransaction,
  ExecutionDevice,
  DeviceProjectBinding,
  TaskRun,
  RunEvent,
  RunCommand,
  RunArtifact,
  OutboxEvent,
} from "@voidmix/core";
interface State {
  devices: Map<string, ExecutionDevice>;
  bindings: Map<string, DeviceProjectBinding>;
  runs: Map<string, TaskRun>;
  events: Map<string, RunEvent>;
  commands: Map<string, RunCommand>;
  artifacts: Map<string, RunArtifact>;
  outbox: Map<string, OutboxEvent>;
}
const empty = (): State => ({
  devices: new Map(),
  bindings: new Map(),
  runs: new Map(),
  events: new Map(),
  commands: new Map(),
  artifacts: new Map(),
  outbox: new Map(),
});
const copy = <T>(value: T): T => structuredClone(value);
const bindingKey = (deviceId: string, projectId: string) => JSON.stringify([deviceId, projectId]);
function transaction(state: State): ExecutionTransaction {
  return {
    getDevice: async (id) => copy(state.devices.get(id) ?? null),
    findDeviceByHash: async (hash) =>
      copy([...state.devices.values()].find((device) => device.credentialHash === hash) ?? null),
    listDevices: async (ownerId) =>
      copy([...state.devices.values()].filter((device) => device.ownerUserId === ownerId)),
    saveDevice: async (device) => {
      state.devices.set(device.id, copy(device));
    },
    getBinding: async (deviceId, projectId) =>
      copy(state.bindings.get(bindingKey(deviceId, projectId)) ?? null),
    listBindings: async (deviceId) =>
      copy([...state.bindings.values()].filter((binding) => binding.deviceId === deviceId)),
    saveBinding: async (binding) => {
      state.bindings.set(bindingKey(binding.deviceId, binding.projectId), copy(binding));
    },
    getRun: async (id) => copy(state.runs.get(id) ?? null),
    listRuns: async (projectId, taskId) =>
      copy(
        [...state.runs.values()].filter(
          (run) => run.projectId === projectId && (!taskId || run.taskId === taskId),
        ),
      ),
    listDeviceRuns: async (deviceId) =>
      copy([...state.runs.values()].filter((run) => run.targetDeviceId === deviceId)),
    findRunIntent: async (actorId, key) =>
      copy(
        [...state.runs.values()].find(
          (run) => run.requestedByUserId === actorId && run.idempotencyKey === key,
        ) ?? null,
      ),
    saveRun: async (run) => {
      state.runs.set(run.id, copy(run));
    },
    queueRun: async (run) => {
      state.runs.set(run.id, copy(run));
      state.outbox.set(`execution-${run.id}`, {
        id: `execution-${run.id}`,
        type: "agent.run.queued",
        payload: { runId: run.id, projectId: run.projectId, targetDeviceId: run.targetDeviceId },
      });
    },
    listEvents: async (runId, afterSeq, limit) =>
      copy(
        [...state.events.values()]
          .filter((event) => event.runId === runId && event.seq > afterSeq)
          .sort((a, b) => a.seq - b.seq)
          .slice(0, limit),
      ),
    getEvent: async (runId, seq) => copy(state.events.get(`${runId}:${seq}`) ?? null),
    appendEvent: async (event) => {
      state.events.set(`${event.runId}:${event.seq}`, copy(event));
    },
    listCommands: async (runId) =>
      copy(
        [...state.commands.values()]
          .filter((command) => command.runId === runId)
          .sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
          ),
      ),
    saveCommand: async (command) => {
      state.commands.set(command.id, copy(command));
    },
    listArtifacts: async (runId) =>
      copy([...state.artifacts.values()].filter((artifact) => artifact.runId === runId)),
    saveArtifact: async (artifact) => {
      state.artifacts.set(artifact.id, copy(artifact));
    },
  };
}
/** Atomic copy-on-commit transactions preserve rollback and prevent mutable read leaks. */
export class InMemoryExecutionRepository implements ExecutionRepository {
  private state = empty();
  private tail: Promise<void> = Promise.resolve();
  read<T>(operation: (tx: ExecutionTransaction) => Promise<T>): Promise<T> {
    return operation(transaction(copy(this.state)));
  }
  async transaction<T>(operation: (tx: ExecutionTransaction) => Promise<T>): Promise<T> {
    const predecessor = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await predecessor;
    try {
      const draft = copy(this.state);
      const result = await operation(transaction(draft));
      this.state = draft;
      return copy(result);
    } finally {
      release();
    }
  }
  async outboxItems(): Promise<OutboxEvent[]> {
    return copy([...this.state.outbox.values()]);
  }
}
