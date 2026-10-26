import { createLogger, initLogger, type AuditableLogger, type WideEvent } from "evlog";
import { createLoggerStorage } from "evlog/toolkit/storage";
import { beforeEach, describe, expect, expectTypeOf, it } from "vite-plus/test";

import { getLogger, runWithLogger, useLogger } from "../../src/context.js";

let events: WideEvent[];

beforeEach(() => {
  events = [];
  initLogger({
    silent: true,
    pretty: false,
    redact: false,
    drain: ({ event }) => {
      events.push(event);
    },
  });
});

describe("logger context", () => {
  it("returns undefined or a native error when no logger is active", () => {
    expect(getLogger()).toBeUndefined();
    expect(() => useLogger()).toThrow(/runWithLogger/);
  });

  it("preserves synchronous results and restores context after a throw", () => {
    const logger = createLogger();
    const result = runWithLogger(logger, () => {
      expect(useLogger()).toBe(logger);
      return 42;
    });
    expectTypeOf(result).toEqualTypeOf<number>();
    expect(result).toBe(42);
    expect(getLogger()).toBeUndefined();

    const error = new Error("operation failed");
    expect(() =>
      runWithLogger(logger, () => {
        throw error;
      }),
    ).toThrow(error);
    expect(getLogger()).toBeUndefined();
  });

  it("returns the original promise and restores context after rejection", async () => {
    const logger = createLogger();
    const promise = Promise.resolve(42);
    const result = runWithLogger(logger, () => promise);
    expectTypeOf(result).toEqualTypeOf<Promise<number>>();
    expect(result).toBe(promise);
    await expect(result).resolves.toBe(42);

    await expect(
      runWithLogger(logger, async () => {
        await Promise.resolve();
        expect(useLogger()).toBe(logger);
        throw new Error("async operation failed");
      }),
    ).rejects.toThrow("async operation failed");
    expect(getLogger()).toBeUndefined();
  });

  it("isolates concurrent asynchronous loggers and their fields", async () => {
    const left = createLogger({ task: "left" });
    const right = createLogger({ task: "right" });
    const results = await Promise.all(
      [left, right].map((logger, index) =>
        runWithLogger(logger, async () => {
          await Promise.resolve();
          expect(useLogger()).toBe(logger);
          useLogger().set({ result: index });
          await Promise.resolve();
          expect(getLogger()).toBe(logger);
          return useLogger().getContext();
        }),
      ),
    );

    expect(results).toEqual([
      expect.objectContaining({ task: "left", result: 0 }),
      expect.objectContaining({ task: "right", result: 1 }),
    ]);
    expect(getLogger()).toBeUndefined();
    expect(events).toEqual([]);
  });

  it("restores nested loggers without merging fields or emitting events", () => {
    const parent = createLogger({ parent: true });
    const child = createLogger({ child: true });

    runWithLogger(parent, () => {
      runWithLogger(child, () => {
        expect(useLogger()).toBe(child);
        useLogger().set({ nested: true });
      });
      expect(useLogger()).toBe(parent);
      expect(() =>
        runWithLogger(child, () => {
          throw new Error("child failed");
        }),
      ).toThrow("child failed");
      expect(useLogger()).toBe(parent);
    });

    expect(events).toEqual([]);
    parent.set({ completed: true });
    child.set({ completed: true });
    expect(parent.getContext()).toEqual({ parent: true, completed: true });
    expect(child.getContext()).toEqual({ child: true, nested: true, completed: true });
    expect(parent.emit()).not.toBeNull();
    expect(child.emit()).not.toBeNull();
    expect(getLogger()).toBeUndefined();
  });

  it("shares evlog's public storage slot", () => {
    const upstream = createLoggerStorage("other consumer", "@raypx/logger/context");
    const logger = createLogger();

    runWithLogger(logger, () => expect(upstream.useLogger()).toBe(logger));
    upstream.storage.run(logger, () => expect(useLogger()).toBe(logger));
    expect(getLogger()).toBeUndefined();
  });

  it("accepts typed loggers and preserves custom field types in accessors", () => {
    type Fields = { job: { id: string; count: number } };
    const logger = createLogger<Fields>({ job: { id: "sync" } });

    runWithLogger(logger, () => {
      const required = useLogger<Fields>();
      const optional = getLogger<Fields>();
      expectTypeOf(required).toEqualTypeOf<AuditableLogger<Fields>>();
      expectTypeOf(optional).toEqualTypeOf<AuditableLogger<Fields> | undefined>();
      expectTypeOf(required.getContext().job?.count).toEqualTypeOf<number | undefined>();
      required.set({ job: { count: 2 } });
      expect(optional).toBe(logger);
    });

    expect(logger.getContext().job).toEqual({ id: "sync", count: 2 });
  });
});
