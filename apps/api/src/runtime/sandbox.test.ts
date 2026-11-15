import { afterEach, expect, it, vi } from "vitest";
import type { Database } from "@raypx/database/connection";
import { createMemoryComputerProvider, type ComputerProvider } from "@raypx/providers/computer";
import { sandboxCipher } from "../config/sandbox.js";
import { createConfigReads } from "../config/reads.js";
import { databaseComputerProvider } from "./sandbox.js";

const mocks = vi.hoisted(() => ({ make: vi.fn() }));
vi.mock("@raypx/providers/computer/docker", () => ({
  createDockerComputerProvider: mocks.make,
  testDockerComputerConnection: vi.fn(),
}));
afterEach(() => vi.useRealTimers());

async function fixture() {
  const key = "fake-configuration-encryption-key-32-characters";
  const url = "https://supervisor.example.test";
  const row = {
    id: "sandbox",
    revision: 1,
    provider: "docker",
    url,
    screen: false,
    credentials: await sandboxCipher(key).seal("fake-supervisor-token-with-32-characters", url),
    updatedAt: new Date(),
  };
  const select = vi.fn((columns?: unknown) => ({
    from: () => ({ where: async () => (columns ? [{ url }] : [row]) }),
  }));
  const db = { select } as unknown as Database;
  const underlying = createMemoryComputerProvider();
  mocks.make.mockReturnValue(underlying);
  const reads = createConfigReads();
  const sandbox = databaseComputerProvider(db, key, reads);
  const ref = { id: crypto.randomUUID(), generation: 1 };
  return { row, select, underlying, provider: sandbox.provider, ref, reads };
}

it("constructs without I/O and applies Screen policy on every call", async () => {
  const f = await fixture();
  expect(f.select).not.toHaveBeenCalled();
  const start = vi.spyOn(f.underlying, "startScreen");
  await expect(f.provider.startScreen!(f.ref)).rejects.toMatchObject({
    code: "SCREEN_UNAVAILABLE",
  });
  expect(start).not.toHaveBeenCalled();
  f.row.screen = true;
  f.row.revision++;
  await f.underlying.provision(f.ref);
  expect(await f.provider.startScreen!(f.ref)).toMatchObject({ available: true, running: true });
  f.row.provider = "none";
  f.row.revision++;
  expect(await f.provider.configured!()).toBe(false);
  await expect(f.provider.get(f.ref)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  f.reads.close();
});

it("closes a silent admitted command and cancels it when its configuration revision changes", async () => {
  const f = await fixture();
  let finish: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const cancel = vi.fn(async () => finish!());
  f.underlying.execute = async () => ({
    events: (async function* () {
      await blocked;
      yield { kind: "exit", status: 0, cancelled: false, truncated: false } as const;
    })(),
    cancel,
  });
  const process = await f.provider.execute(f.ref, {
    executable: "echo",
    argv: [],
    cwd: ".",
    environment: {},
    outputBudget: 1024,
  });
  vi.useFakeTimers();
  const iterator = process.events[Symbol.asyncIterator]();
  const result = iterator.next().then(
    () => null,
    (error: unknown) => error,
  );
  f.row.revision++;
  f.row.provider = "none";
  await vi.advanceTimersByTimeAsync(1000);
  expect(await result).toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  expect(cancel).toHaveBeenCalledOnce();
  f.reads.close();
});

it("does not publish a successful command event after a setting change", async () => {
  const f = await fixture();
  const execute: ComputerProvider["execute"] = async () => {
    f.row.revision++;
    return {
      events: (async function* () {
        yield { kind: "exit", status: 0, cancelled: false, truncated: false } as const;
      })(),
      cancel: async () => {},
    };
  };
  f.underlying.execute = execute;
  const process = await f.provider.execute(f.ref, {
    executable: "echo",
    argv: [],
    cwd: ".",
    environment: {},
    outputBudget: 1024,
  });
  await expect(process.events[Symbol.asyncIterator]().next()).rejects.toMatchObject({
    code: "PROVIDER_UNAVAILABLE",
  });
  f.reads.close();
});
