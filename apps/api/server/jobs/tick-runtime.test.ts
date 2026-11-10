import { beforeEach, expect, it, vi } from "vite-plus/test";
import tickTask from "./runtime/tick.ts";
const mocks = vi.hoisted(() => ({ runtime: vi.fn() }));
vi.mock("../runtime/backend.js", () => ({ getBackendRuntime: mocks.runtime }));
beforeEach(() => vi.resetAllMocks());
const result = { enabled: true, claimed: 1, reconciled: 2, failed: 0 };
it("uses the process-owned server runtime without closing it", async () => {
  const runtime = { jobs: { tick: vi.fn(async () => result) }, close: vi.fn() };
  mocks.runtime.mockResolvedValue(runtime);
  expect(await tickTask.run()).toEqual({ result });
  expect(runtime.close).not.toHaveBeenCalled();
});
it("does not dispatch scheduled jobs in the relay role", async () => {
  mocks.runtime.mockResolvedValue({ role: "relay" });
  expect(await tickTask.run()).toEqual({ result: { enabled: false } });
});
