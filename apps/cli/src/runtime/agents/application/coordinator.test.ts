import { expect, it, vi } from "vite-plus/test";
import type { AgentTask } from "@raypx/core/tasks";
import type { LocalAgentTask } from "../model.js";
import { ExecutionCoordinator, type ExecutionRepository } from "./coordinator.js";
import { ProviderRegistry } from "./providers.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  const records = new Map<string, LocalAgentTask>();
  const leases = new Set<string>();
  const sessions = new Map<
    string,
    { started: ReturnType<typeof deferred>; drained: ReturnType<typeof deferred> }
  >();
  const unexpected = () => {
    throw new Error("Unexpected execution store operation");
  };
  const store: ExecutionRepository = {
    get: (id) => records.get(id),
    put: (local) => {
      records.set(local.task.id, local);
      return undefined;
    },
    accept: (local) => {
      records.set(local.task.id, local);
    },
    transition: (local) => {
      records.set(local.task.id, local);
    },
    seen: () => false,
    tokenUsage: () => undefined,
    recordActivity: unexpected,
    request: unexpected,
    getRequest: unexpected,
    settleEffect: unexpected,
    event: unexpected,
    recordTokenUsage: unexpected,
  };
  const providers = new ProviderRegistry([
    {
      provider: "codex",
      remote: true,
      discover: async () => ({
        provider: "codex",
        available: true,
        version: "synthetic",
        reason: "ready",
        inputModes: ["queue"],
        definition: {
          version: 1,
          runtime: "process",
          modes: ["run"],
          approvals: true,
          modelSelection: false,
        },
      }),
      prepare: async () => ({
        dispose: vi.fn(),
        factory: ({ directory }) => {
          const session = { started: deferred(), drained: deferred() };
          sessions.set(directory, session);
          return {
            handle: { completed: session.drained.promise, kill: async () => {} },
            input: "queue",
            holdPlanOnExit: false,
            planContinuation: "turn",
            planTitle: "Codex",
            turnId: undefined,
            preview: "",
            summary: "",
            initialize: async () => undefined,
            sendTurn: async () => {
              session.started.resolve();
            },
            steer: unexpected,
            interrupt: unexpected,
          };
        },
      }),
    },
  ]);
  const coordinator = new ExecutionCoordinator(
    store,
    providers,
    {
      find: (id) => id,
      canonical: (path) => path,
      lockKey: async (path) => path,
      acquire: (key) => {
        leases.add(key);
        return () => {
          leases.delete(key);
        };
      },
    },
    {
      endpoint: unexpected,
      forget: vi.fn(),
      close: async () => {},
    },
    vi.fn(),
    {},
  );
  async function start(binding: string) {
    const task: AgentTask = {
      id: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      provider: "codex",
      mode: "run",
      prompt: "Synthetic work",
      status: "pending",
      summary: "",
      parentTaskId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await coordinator.start(
      binding,
      crypto.randomUUID(),
      task,
      new Date(Date.now() + 60_000).toISOString(),
    );
    const session = sessions.get(task.projectId)!;
    await session.started.promise;
    return { task, session, local: records.get(task.id)! };
  }
  return { coordinator, start, records, leases };
}

it.each([
  { operation: "cancel", secondBinding: "desktop:first" },
  { operation: "cancel", secondBinding: "desktop:second" },
  { operation: "detach", secondBinding: "desktop:second" },
] as const)(
  "$operation waits only for its own execution to drain ($secondBinding)",
  async ({ operation, secondBinding }) => {
    const f = fixture();
    const first = await f.start("desktop:first");
    const second = await f.start(secondBinding);
    const firstStop = f.coordinator.cancelTask(first.local);
    let completed = false;
    const secondStop = (
      operation === "cancel"
        ? f.coordinator.cancelTask(second.local)
        : f.coordinator.detach(secondBinding)
    ).then(() => {
      completed = true;
    });
    try {
      expect(f.leases.has(second.task.projectId)).toBe(true);
      second.session.drained.resolve();
      await expect.poll(() => f.records.get(second.task.id)?.task.status).toBe("cancelled");
      await expect.poll(() => completed, { timeout: 200, interval: 5 }).toBe(true);
      expect(f.leases.has(second.task.projectId)).toBe(false);
      expect(f.leases.has(first.task.projectId)).toBe(true);
      expect(f.records.get(first.task.id)?.task.status).toBe("cancelling");
    } finally {
      first.session.drained.resolve();
      second.session.drained.resolve();
      await Promise.allSettled([firstStop, secondStop]);
      await f.coordinator.close();
    }
  },
);

it("keeps daemon shutdown pending until every execution has drained", async () => {
  const f = fixture();
  const first = await f.start("desktop:first");
  const second = await f.start("desktop:second");
  let completed = false;
  const closing = f.coordinator.close().then(() => {
    completed = true;
  });
  try {
    second.session.drained.resolve();
    await expect.poll(() => f.records.get(second.task.id)?.task.status).toBe("cancelled");
    expect(completed).toBe(false);
    expect(f.leases.has(first.task.projectId)).toBe(true);
    first.session.drained.resolve();
    await closing;
    expect(completed).toBe(true);
    expect(f.leases.size).toBe(0);
  } finally {
    first.session.drained.resolve();
    second.session.drained.resolve();
    await closing;
  }
});
