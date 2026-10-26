import { beforeEach, expect, it, vi } from "vite-plus/test";
import nodeTask from "../../../server/jobs/runtime/tick-node.js";
import cloudflareTask from "../../../server/jobs/runtime/tick-cloudflare.js";
const mocks = vi.hoisted(() => ({ node: vi.fn(), worker: vi.fn() }));
vi.mock("../../../server/runtime/node.js", () => ({ getApiRuntime: mocks.node }));
vi.mock("../../../server/runtime/cloudflare.js", () => ({ createCloudflareRuntime: mocks.worker }));
beforeEach(() => vi.resetAllMocks());
const result = { enabled: true, claimed: 1, reconciled: 2, failed: 0 };
it("uses the process-owned Node runtime without closing it", async () => {
  const runtime = { jobs: { tick: vi.fn(async () => result) }, close: vi.fn() };
  mocks.node.mockResolvedValue(runtime);
  expect(await nodeTask.run()).toEqual({ result });
  expect(runtime.close).not.toHaveBeenCalled();
});
it("requires explicit Worker event bindings", async () => {
  await expect(
    cloudflareTask.run({ name: "schedules:tick", payload: {}, context: {} }),
  ).rejects.toThrow("Cloudflare task bindings are required");
  expect(mocks.worker).not.toHaveBeenCalled();
});
it("closes the event-owned Worker runtime after both success and failure", async () => {
  const close = vi.fn();
  const tick = vi
    .fn()
    .mockResolvedValueOnce(result)
    .mockRejectedValueOnce(new Error("private-driver-error"));
  mocks.worker.mockResolvedValue({ jobs: { tick }, close });
  const event = {
    name: "schedules:tick",
    payload: {},
    context: { cloudflare: { env: { NODE_ENV: "test" } } },
  };
  expect(await cloudflareTask.run(event)).toEqual({ result });
  await expect(cloudflareTask.run(event)).rejects.toThrow(/^Schedule task failed$/);
  expect(close).toHaveBeenCalledTimes(2);
});
