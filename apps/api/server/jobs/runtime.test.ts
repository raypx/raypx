import { beforeEach, expect, it, vi } from "vitest";
import cleanupTask from "./runtime/cleanup.js";

const mocks = vi.hoisted(() => ({ runtime: vi.fn() }));
vi.mock("../runtime/backend.js", () => ({ getBackendRuntime: mocks.runtime }));
beforeEach(() => vi.resetAllMocks());

const result = {
  status: "completed",
  sessions: 1,
  verifications: 2,
  rateLimits: 3,
  contextCommands: 0,
};
it("uses the server runtime without closing the shared HTTP pool", async () => {
  const runtime = { jobs: { cleanup: vi.fn(async () => result) }, close: vi.fn() };
  mocks.runtime.mockResolvedValue(runtime);
  expect(await cleanupTask.run()).toEqual({ result });
  expect(runtime.jobs.cleanup).toHaveBeenCalledOnce();
  expect(runtime.close).not.toHaveBeenCalled();
});
it("does not run maintenance in the relay role", async () => {
  mocks.runtime.mockResolvedValue({ role: "relay" });
  expect(await cleanupTask.run()).toEqual({ result: { status: "disabled" } });
});
