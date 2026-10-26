import { afterEach, expect, it, vi } from "vite-plus/test";
import { JobError, type CloudJobRun } from "@raypx/jobs";
import { RelayRoom } from "../../server/relay/cloudflare.js";
import { RelayHub } from "../../server/relay/hub.js";
import { createCloudflareApp, type CloudflareRequest } from "../../server/app/cloudflare.js";
import { createApiApp } from "../../server/api.js";

afterEach(() => vi.restoreAllMocks());
function run(): CloudJobRun {
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  return {
    id,
    taskId: id,
    jobId: crypto.randomUUID(),
    jobRevision: 1,
    trigger: "manual",
    scheduledFor: now,
    startedAt: now,
    finishedAt: null,
    status: "dispatching",
    code: null,
    sync: null,
    action: {
      type: "agent.run",
      deviceId: crypto.randomUUID(),
      epoch: 1,
      projectId: crypto.randomUUID(),
      provider: "codex",
      mode: "plan",
      prompt: "Fixture",
    },
  };
}
function room() {
  return new RelayRoom({ id: { name: "account" }, waitUntil() {} }, {});
}
function request(path: string, payload: unknown) {
  return new Request(`https://relay${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}
it("routes account-bound internal jobs to the room hub and preserves uncertain outcomes", async () => {
  const value = run(),
    dispatch = vi
      .spyOn(RelayHub.prototype, "dispatch")
      .mockResolvedValue({ type: "task", taskId: value.id, status: "running" });
  const relay = room();
  const response = await relay.fetch(request("/jobs/dispatch", { userId: "account", run: value }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ type: "task", taskId: value.id, status: "running" });
  expect(dispatch).toHaveBeenCalledWith("account", value, expect.any(AbortSignal));
  dispatch.mockRejectedValueOnce(new JobError("DEVICE_OFFLINE", true));
  const failed = await relay.fetch(request("/jobs/dispatch", { userId: "account", run: value }));
  expect(await failed.json()).toEqual({ error: { code: "DEVICE_OFFLINE", uncertain: true } });
});
it("validates internal payload and room ownership without starting any dispatch", async () => {
  const dispatch = vi.spyOn(RelayHub.prototype, "dispatch"),
    relay = room(),
    value = run();
  expect(
    (await relay.fetch(request("/jobs/dispatch", { userId: "another", run: value }))).status,
  ).toBe(403);
  const invalid = await relay.fetch(
    request("/jobs/dispatch", { userId: "account", run: value, cookie: "private" }),
  );
  expect(await invalid.json()).toEqual({ error: { code: "INVALID_INPUT", uncertain: false } });
  expect(dispatch).not.toHaveBeenCalled();
});
it("does not forward a public /jobs path into the internal Durable Object port", async () => {
  const forward = vi.fn(async () => new Response(null, { status: 204 }));
  const app = createCloudflareApp(async () => ({
    app: createApiApp({
      authHandler: async () => new Response(null),
      readSession: async () => null,
      allowedOrigins: [],
    }),
    close: async () => {},
  }));
  const publicRequest: CloudflareRequest = Object.assign(
    request("/jobs/dispatch", { userId: "account", run: run() }),
    {
      runtime: { cloudflare: { env: { RAYPX_RELAY: { getByName: () => ({ fetch: forward }) } } } },
    },
  );
  expect((await app.fetch(publicRequest)).status).toBe(404);
  expect(forward).not.toHaveBeenCalled();
});

it("checks the stable Durable Object id when the constructor does not carry a name", async () => {
  const value = run(),
    dispatch = vi
      .spyOn(RelayHub.prototype, "dispatch")
      .mockResolvedValue({ type: "task", taskId: value.id, status: "running" });
  const relay = new RelayRoom(
    { id: { toString: () => "scope-account" }, waitUntil() {} },
    {
      RAYPX_RELAY: {
        getByName: () => ({ fetch: async () => new Response(null) }),
        idFromName: (name) => ({ toString: () => `scope-${name}` }),
      },
    },
  );
  expect(
    (await relay.fetch(request("/jobs/dispatch", { userId: "account", run: value }))).status,
  ).toBe(200);
  expect(
    (await relay.fetch(request("/jobs/dispatch", { userId: "other", run: value }))).status,
  ).toBe(403);
  expect(dispatch).toHaveBeenCalledOnce();
});
