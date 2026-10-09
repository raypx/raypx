import { createLogger } from "@raypx/logger";
import { expect, test, vi } from "vite-plus/test";
import { RuntimeLifecycle } from "../src/runtime.js";
import { readinessResponse } from "../src/health.js";

const logger = createLogger({ level: "silent" });

test("requires initialization and only probes registered resources", async () => {
  const runtime = new RuntimeLifecycle(logger);
  expect((await readinessResponse(runtime)).status).toBe(503);
  runtime.markReady();
  expect(await runtime.checkReadiness()).toEqual({ status: "ok", checks: {} });
  runtime.register({ name: "database", check: () => {} });
  expect(await runtime.checkReadiness()).toEqual({ status: "ok", checks: { database: "ok" } });
});

test("required resource failures make readiness unavailable, optional failures do not", async () => {
  const runtime = new RuntimeLifecycle(logger);
  runtime.markReady();
  runtime.register({
    name: "optional-cache",
    required: false,
    check: () => {
      throw new Error("offline");
    },
  });
  expect((await runtime.checkReadiness()).status).toBe("ok");
  runtime.register({
    name: "database",
    check: () => {
      throw new Error("offline");
    },
  });
  const response = await readinessResponse(runtime);
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).not.toContain("offline");
});

test("bounds hanging resource checks", async () => {
  const runtime = new RuntimeLifecycle(logger, 10);
  runtime.markReady();
  runtime.register({ name: "slow", check: () => new Promise(() => {}) });
  expect(await runtime.checkReadiness()).toEqual({
    status: "unavailable",
    checks: { slow: "failed" },
  });
});

test("drains before closing and closes once in reverse creation order", async () => {
  const runtime = new RuntimeLifecycle(logger);
  runtime.markReady();
  const order: string[] = [];
  const first = vi.fn<() => void>(() => {
    order.push("first");
  });
  const second = vi.fn<() => Promise<void>>(async () => {
    expect((await runtime.checkReadiness()).status).toBe("unavailable");
    order.push("second");
  });
  runtime.register({ name: "first", dispose: first });
  runtime.register({ name: "second", dispose: second });
  await Promise.all([runtime.dispose(), runtime.dispose()]);
  expect(order).toEqual(["second", "first"]);
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  expect(() => runtime.register({ name: "late" })).toThrow("shutdown");
});

test("continues closing remaining resources after a cleanup failure", async () => {
  const runtime = new RuntimeLifecycle(logger);
  const dispose = vi.fn<() => void>();
  runtime.register({ name: "first", dispose });
  runtime.register({
    name: "broken",
    dispose: () => {
      throw new Error("cleanup failed");
    },
  });
  await runtime.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});
