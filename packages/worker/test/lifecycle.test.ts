import { expect, test, vi } from "vite-plus/test";
import { WorkerManager, type RunningTask } from "../src/manager.js";
import { defineTask, TaskCancelledError, type TaskProgress } from "../src/task.js";

vi.mock("@raypx/logger", () => ({
  createLogger: () => ({
    info: vi.fn<(...args: unknown[]) => void>(),
    debug: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

test("preserves the original failure without an error listener and cleans up once", async () => {
  const failure = new Error("execution failed");
  const cleanup = vi.fn<() => Promise<void>>(async () => {});
  const task = defineTask({
    name: "failing",
    async execute() {
      throw failure;
    },
    cleanup,
  });
  await expect(task.execute(undefined)).rejects.toBe(failure);
  expect(cleanup).toHaveBeenCalledTimes(1);
});

test("preserves the execution failure even if cleanup also fails", async () => {
  const failure = new Error("execution failed");
  const task = defineTask({
    name: "failing-cleanup",
    async execute() {
      throw failure;
    },
    async cleanup() {
      throw new Error("cleanup failed");
    },
  });
  await expect(task.execute(undefined)).rejects.toBe(failure);
});

test("cancels cooperatively without completion or duplicate cleanup and can be reused", async () => {
  const gate = deferred<void>();
  const cleanup = vi.fn<() => Promise<void>>(async () => {});
  const complete = vi.fn<(data: unknown) => void>();
  let observedCancellation = false;
  const task = defineTask({
    name: "cancelled",
    async execute() {
      await gate.promise;
      observedCancellation = this.isCancelled();
      return "done";
    },
    cleanup,
  });
  task.on("complete", complete);
  const execution = task.execute(undefined);
  const outcome = execution.catch((error: unknown) => error);
  await task.cancel();
  await task.cancel();
  gate.resolve();
  await expect(outcome).resolves.toBeInstanceOf(TaskCancelledError);
  expect(observedCancellation).toBe(true);
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(complete).not.toHaveBeenCalled();
  await expect(task.execute(undefined)).resolves.toBe("done");
  expect(observedCancellation).toBe(false);
  expect(cleanup).toHaveBeenCalledTimes(2);
});

test("isolates progress and completion between concurrent executions of the same task", async () => {
  const manager = new WorkerManager();
  const gates = { first: deferred<void>(), second: deferred<void>() };
  const starts: RunningTask[] = [];
  const progress: Array<{ id: string; progress: TaskProgress }> = [];
  const completed: Array<{ id: string; result: string }> = [];
  manager.on("task:start", (task: RunningTask) => starts.push({ ...task }));
  manager.on("task:progress", (task: { id: string; progress: TaskProgress }) =>
    progress.push(task),
  );
  manager.on("task:complete", (task: { id: string; result: string }) => completed.push(task));
  manager.register(
    defineTask({
      name: "parallel",
      async execute({ run }: { run: "first" | "second" }) {
        this.emit("progress", { status: run, percent: 10 });
        await gates[run].promise;
        this.emit("progress", { status: run, percent: 100 });
        return run;
      },
    }),
  );
  const first = manager.execute<string>("parallel", { run: "first" });
  const second = manager.execute<string>("parallel", { run: "second" });
  expect(starts).toHaveLength(2);
  expect(progress.map(({ id, progress: update }) => [id, update.status])).toEqual([
    [starts[0]?.id, "first"],
    [starts[1]?.id, "second"],
  ]);
  gates.first.resolve();
  await expect(first).resolves.toBe("first");
  expect(manager.getStatus().map(({ id }) => id)).toEqual([starts[1]?.id]);
  gates.second.resolve();
  await expect(second).resolves.toBe("second");
  expect(completed.map(({ id, result }) => [id, result])).toEqual([
    [starts[0]?.id, "first"],
    [starts[1]?.id, "second"],
  ]);
  expect(progress).toHaveLength(4);
  expect(manager.getStatus()).toEqual([]);
});

test("cancels only the requested execution of a concurrently running task", async () => {
  const manager = new WorkerManager();
  const gates = { first: deferred<void>(), second: deferred<void>() };
  const cleanup = vi.fn<() => Promise<void>>(async () => {});
  const starts: RunningTask[] = [];
  const completed = vi.fn<(data: unknown) => void>();
  const cancelled = vi.fn<(data: unknown) => void>();
  const observed: Record<string, boolean> = {};
  manager.on("task:start", (task: RunningTask) => starts.push({ ...task }));
  manager.on("task:complete", completed);
  manager.on("task:cancel", cancelled);
  manager.register(
    defineTask({
      name: "parallel-cancel",
      async execute({ run }: { run: "first" | "second" }) {
        await gates[run].promise;
        observed[run] = this.isCancelled();
        return run;
      },
      cleanup,
    }),
  );
  const first = manager.execute<string>("parallel-cancel", { run: "first" });
  const firstOutcome = first.catch((error: unknown) => error);
  const second = manager.execute<string>("parallel-cancel", { run: "second" });
  const firstId = starts[0]?.id;
  if (!firstId) throw new Error("First execution did not start");
  await manager.cancel(firstId);
  gates.first.resolve();
  gates.second.resolve();
  await expect(firstOutcome).resolves.toBeInstanceOf(TaskCancelledError);
  await expect(second).resolves.toBe("second");
  expect(observed).toEqual({ first: true, second: false });
  expect(cleanup).toHaveBeenCalledTimes(2);
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(completed).toHaveBeenCalledTimes(1);
  expect(manager.getStatus()).toEqual([]);
});

test("removes a failed execution from the manager and reports the original error", async () => {
  const manager = new WorkerManager();
  const failure = new Error("managed failure");
  const reported = vi.fn<(data: unknown) => void>();
  manager.on("task:error", reported);
  manager.register(
    defineTask({
      name: "managed-failure",
      async execute() {
        throw failure;
      },
    }),
  );
  await expect(manager.execute("managed-failure")).rejects.toBe(failure);
  expect(reported).toHaveBeenCalledWith(
    expect.objectContaining({ status: "error", error: failure }),
  );
  expect(manager.getStatus()).toEqual([]);
});
