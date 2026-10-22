import { beforeEach, expect, it, vi } from "vite-plus/test";
import cloudflareTask from "../../../server/jobs/runtime/cloudflare.js";
import nodeTask from "../../../server/jobs/runtime/node.js";

const mocks = vi.hoisted(() => ({ node: vi.fn(), cloudflare: vi.fn() }));
vi.mock("../../../server/runtime/node.js", () => ({ getApiRuntime: mocks.node }));
vi.mock("../../../server/runtime/cloudflare.js", () => ({
  createCloudflareRuntime: mocks.cloudflare,
}));
beforeEach(() => vi.resetAllMocks());

const result = { status: "completed", sessions: 1, verifications: 2, rateLimits: 3 };
const event = (env: Record<string, string>) => ({
  name: "maintenance:cleanup",
  payload: {},
  context: { cloudflare: { env } },
});

it("uses the Node runtime without closing the shared HTTP pool", async () => {
  const runtime = { jobs: { cleanup: vi.fn(async () => result) }, close: vi.fn() };
  mocks.node.mockResolvedValue(runtime);
  expect(await nodeTask.run()).toEqual({ result });
  expect(runtime.jobs.cleanup).toHaveBeenCalledOnce();
  expect(runtime.close).not.toHaveBeenCalled();
});

it("requires Worker event bindings and never falls back to process environment", async () => {
  await expect(
    cloudflareTask.run({ name: "maintenance:cleanup", payload: {}, context: {} }),
  ).rejects.toThrow("Cloudflare task bindings are required");
  expect(mocks.cloudflare).not.toHaveBeenCalled();
});

it("creates and closes a runtime for each Worker scheduled event", async () => {
  const first = { jobs: { cleanup: vi.fn(async () => result) }, close: vi.fn() };
  const second = { jobs: { cleanup: vi.fn(async () => result) }, close: vi.fn() };
  mocks.cloudflare.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await Promise.all([
    cloudflareTask.run(event({ DATABASE_URL: "first" })),
    cloudflareTask.run(event({ DATABASE_URL: "second" })),
  ]);
  expect(mocks.cloudflare.mock.calls.map(([bindings]) => bindings.DATABASE_URL)).toEqual([
    "first",
    "second",
  ]);
  expect(first.close).toHaveBeenCalledOnce();
  expect(second.close).toHaveBeenCalledOnce();
});

it("closes failed Worker runs and sanitizes initialization and close failures", async () => {
  const close = vi.fn();
  mocks.cloudflare.mockResolvedValueOnce({
    jobs: { cleanup: vi.fn().mockRejectedValue(new Error("private-driver-error")) },
    close,
  });
  await expect(cloudflareTask.run(event({}))).rejects.toThrow("Cleanup task failed");
  expect(close).toHaveBeenCalledOnce();
  mocks.cloudflare.mockRejectedValueOnce(new Error("private-init-error"));
  await expect(cloudflareTask.run(event({}))).rejects.toThrow("Cleanup task failed");
  mocks.cloudflare.mockResolvedValueOnce({
    jobs: { cleanup: async () => result },
    close: vi.fn().mockRejectedValue(new Error("private-close-error")),
  });
  await expect(cloudflareTask.run(event({}))).rejects.toThrow("Cleanup task failed");
});
