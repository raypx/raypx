import { beforeEach, expect, it, vi } from "vite-plus/test";
import cleanupTask from "../../../server/jobs/runtime/cleanup.js";

const mocks = vi.hoisted(() => ({ runtime: vi.fn() }));
vi.mock("../../../server/runtime/server.js", () => ({ getApiRuntime: mocks.runtime }));
beforeEach(() => vi.resetAllMocks());

const result = {
  status: "completed",
  sessions: 1,
  verifications: 2,
  rateLimits: 3,
  observedRequests: 0,
  observedSessions: 0,
  contextCommands: 0,
};
it("uses the server runtime without closing the shared HTTP pool", async () => {
  const runtime = { jobs: { cleanup: vi.fn(async () => result) }, close: vi.fn() };
  mocks.runtime.mockResolvedValue(runtime);
  expect(await cleanupTask.run()).toEqual({ result });
  expect(runtime.jobs.cleanup).toHaveBeenCalledOnce();
  expect(runtime.close).not.toHaveBeenCalled();
});
