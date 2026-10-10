import { runCommand } from "citty";
import { afterEach, expect, test, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn<() => Promise<void>>(async () => undefined),
  consumers: vi.fn<(kind: string) => Promise<void>>(async () => undefined),
  verify: vi.fn<
    (
      dependencies: unknown,
      options: { verbose?: boolean; signal?: AbortSignal },
    ) => Promise<{ ok: boolean }>
  >(async () => ({ ok: true })),
  dependencies: vi.fn<(root: string, environment: NodeJS.ProcessEnv) => object>(
    (root, environment) => ({ root, environment }),
  ),
}));
vi.mock("../lib/consumer/prepare.ts", () => ({ prepareConsumer: mocks.prepare }));
vi.mock("../lib/consumer/run.ts", () => ({ runConsumers: mocks.consumers }));
vi.mock("../lib/verify/run.ts", () => ({ runVerify: mocks.verify }));
vi.mock("../lib/verify/runtime.ts", () => ({ createVerifyDependencies: mocks.dependencies }));

import consumerCommand from "../commands/consumer.ts";
import verifyCommand from "../commands/verify.ts";

const originalExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("standalone consumer prepares exactly once before executing the selected prepared fixture", async () => {
  const calls: string[] = [];
  mocks.prepare.mockImplementation(async () => {
    calls.push("prepare");
  });
  mocks.consumers.mockImplementation(async (kind) => {
    calls.push(`consume:${kind}`);
  });
  await runCommand(consumerCommand, { rawArgs: ["--kind", "server"] });
  expect(calls).toEqual(["prepare", "consume:server"]);
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(mocks.consumers).toHaveBeenCalledWith("server");
});

test("verify CLI forwards verbose and removes both signal listeners after completion", async () => {
  mocks.verify.mockResolvedValue({ ok: true });
  const on = vi.spyOn(process, "on");
  const off = vi.spyOn(process, "off");
  await runCommand(verifyCommand, { rawArgs: ["--verbose"] });
  expect(mocks.verify).toHaveBeenCalledWith(expect.anything(), {
    verbose: true,
    signal: expect.any(AbortSignal),
  });
  for (const name of ["SIGINT", "SIGTERM"]) {
    const listener = on.mock.calls.find(([event]) => event === name)?.[1];
    expect(listener).toBeTypeOf("function");
    expect(off).toHaveBeenCalledWith(name, listener);
  }
  expect(mocks.prepare).not.toHaveBeenCalled();
});

test("SIGINT aborts verification, reports interrupt status, and removes listeners", async () => {
  const on = vi.spyOn(process, "on");
  const off = vi.spyOn(process, "off");
  mocks.verify.mockImplementation(async (_dependencies, options) => {
    // Node's on overload resolves to its final event type; this selected signal has no arguments.
    const interrupt = on.mock.calls.find(
      ([event]) => String(event) === "SIGINT",
    )?.[1] as unknown as (() => void) | undefined;
    interrupt?.();
    expect(options.signal?.aborted).toBe(true);
    return { ok: false };
  });
  await runCommand(verifyCommand, { rawArgs: [] });
  expect(process.exitCode).toBe(130);
  expect(off.mock.calls.map(([event]) => event)).toEqual(["SIGINT", "SIGTERM"]);
});

test("an unexpected orchestration failure still removes CLI signal listeners", async () => {
  const off = vi.spyOn(process, "off");
  mocks.verify.mockRejectedValueOnce(new Error("unexpected failure"));
  await expect(runCommand(verifyCommand, { rawArgs: [] })).rejects.toThrow("unexpected failure");
  expect(off.mock.calls.map(([event]) => event)).toEqual(["SIGINT", "SIGTERM"]);
});
