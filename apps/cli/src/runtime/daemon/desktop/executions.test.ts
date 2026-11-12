import { expect, it, vi } from "vitest";
import { DesktopExecutions } from "./executions.js";
import type { ExecutionHost } from "../../owner.js";

function fixture() {
  const processes = {
    run: vi.fn(async (_command: unknown, _signal: AbortSignal, id: string) => ({
      id,
      exitCode: 0,
      output: "done",
      cancelled: false,
    })),
    terminal: vi.fn(
      async (_input: unknown, _cols: number, _rows: number, id: string, _signal: AbortSignal) => ({
        id,
      }),
    ),
    cancel: vi.fn(() => ({ cancelled: true })),
    restore: vi.fn(async () => {}),
  };
  const host = {
    runtime: {
      instanceAccess: { assert: async () => {}, status: async () => ({ state: "registered" }) },
      processes,
    },
  } as unknown as ExecutionHost;
  return { executions: new DesktopExecutions(host), processes };
}
const scope = { owner: "native-owner", origin: "https://one.example.test", identity: "registered" };
const command = { executable: "/synthetic/bun", cwd: "/synthetic/work", args: [], timeoutMs: 1000 };

it("registers terminal ownership before launch returns and cleans a late accepted launch on quit", async () => {
  const f = fixture();
  let finish!: (value: { id: string }) => void;
  f.processes.terminal.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.executions.start(
    scope,
    "terminal.open",
    { ...command, cols: 80, rows: 24 },
    new AbortController().signal,
    new AbortController().signal,
  );
  const [entry] = f.executions.list(scope);
  expect(entry).toMatchObject({ kind: "terminal", status: "running" });
  expect(f.executions.list({ ...scope, origin: "https://two.example.test" })).toEqual([]);
  expect(() => f.executions.control({ ...scope, owner: "other-owner" }, entry!.id)).toThrow(
    "unavailable",
  );
  f.executions.release(scope.owner);
  expect(f.processes.terminal.mock.calls[0]![4].aborted).toBe(true);
  finish({ id: entry!.id });
  await pending;
  expect(f.processes.cancel).toHaveBeenLastCalledWith(entry!.id);
  expect(f.executions.list(scope)).toEqual([]);
});

it("does not admit a cancelled request and keeps explicit request cancellation attached to execution", async () => {
  const f = fixture(),
    admission = new AbortController(),
    cancellation = new AbortController();
  admission.abort();
  await expect(
    f.executions.start(scope, "tools.run", command, admission.signal, cancellation.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(f.processes.run).not.toHaveBeenCalled();
  await f.executions.start(
    scope,
    "tools.run",
    command,
    new AbortController().signal,
    cancellation.signal,
  );
  cancellation.abort();
  expect(f.processes.run.mock.calls[0]![1].aborted).toBe(true);
});

it("bounds completed results by entry count and bytes, with explicit unavailable results after eviction", async () => {
  const f = fixture();
  const complete = async (output: string) => {
    const result = await f.executions.start(
      scope,
      "tools.run",
      command,
      new AbortController().signal,
      new AbortController().signal,
    );
    const event = {
      version: 1 as const,
      event: "tool.finished" as const,
      data: { id: result.id, exitCode: 0, output, cancelled: false },
    };
    f.executions.event(event, Buffer.byteLength(JSON.stringify(event)));
    return result.id;
  };
  const first = await complete("small");
  for (let index = 0; index < 64; index++) await complete("small");
  expect(f.executions.list(scope)).toHaveLength(64);
  expect(() => f.executions.result(scope, first)).toThrow("unavailable");
  const large = await complete("x".repeat(1024 * 1024));
  for (let index = 0; index < 8; index++) await complete("x".repeat(1024 * 1024));
  expect(() => f.executions.result(scope, large)).toThrow("unavailable");
  const last = f.executions.list(scope).at(-1)!;
  expect(f.executions.result(scope, last.id).output).toHaveLength(1024 * 1024);
});
