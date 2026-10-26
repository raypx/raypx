import { expect, it, vi } from "vite-plus/test";
import type { CloudJobRun } from "@raypx/jobs";
import { createCloudflareJobTransport } from "../../../server/runtime/cloudflare-jobs.js";

const run = (): CloudJobRun => {
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  return {
    id,
    jobId: crypto.randomUUID(),
    jobRevision: 1,
    trigger: "manual",
    scheduledFor: now,
    startedAt: now,
    finishedAt: null,
    status: "dispatching",
    action: {
      type: "agent.run",
      deviceId: crypto.randomUUID(),
      epoch: 2,
      projectId: crypto.randomUUID(),
      provider: "codex",
      mode: "run",
      prompt: "Fixture",
    },
    taskId: id,
    code: null,
    sync: null,
  };
};
it("targets the account-named private room and forwards the immutable run and cancellation", async () => {
  const value = run();
  const fetch = vi.fn(async (request: Request) => {
    expect(new URL(request.url).pathname).toBe("/jobs/dispatch");
    expect(await request.json()).toEqual({ userId: "account-a", run: value });
    return Response.json({ type: "task", taskId: value.id, status: "pending" });
  });
  const getByName = vi.fn(() => ({ fetch }));
  const controller = new AbortController();
  const transport = createCloudflareJobTransport({ RAYPX_RELAY: { getByName } });
  expect(await transport.dispatch("account-a", value, controller.signal)).toEqual({
    type: "task",
    taskId: value.id,
    status: "pending",
  });
  expect(getByName).toHaveBeenCalledWith("account-a");
  controller.abort();
  expect(fetch.mock.calls[0]![0].signal.aborted).toBe(true);
});
it("retains known not-delivered room errors without leaking malformed diagnostic bodies", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: { code: "DEVICE_OFFLINE", uncertain: false } }, { status: 503 }),
    )
    .mockResolvedValueOnce(
      Response.json(
        { error: { code: "postgres://secret-password", uncertain: true } },
        { status: 503 },
      ),
    );
  const transport = createCloudflareJobTransport({ RAYPX_RELAY: { getByName: () => ({ fetch }) } });
  await expect(
    transport.dispatch("account", run(), new AbortController().signal),
  ).rejects.toMatchObject({ code: "DEVICE_OFFLINE", uncertain: false });
  await expect(
    transport.dispatch("account", run(), new AbortController().signal),
  ).rejects.toMatchObject({ code: "CONTROL_UNAVAILABLE", uncertain: true });
});
it("marks lost or contradictory dispatch receipts uncertain and never retries", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("private-network-details"))
    .mockResolvedValueOnce(
      Response.json({ type: "task", taskId: crypto.randomUUID(), status: "running" }),
    );
  const transport = createCloudflareJobTransport({ RAYPX_RELAY: { getByName: () => ({ fetch }) } });
  for (let index = 0; index < 2; index++)
    await expect(
      transport.dispatch("account", run(), new AbortController().signal),
    ).rejects.toMatchObject({ code: "CONTROL_UNAVAILABLE", uncertain: true });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("validates sync watermarks and fails safely without the private relay binding", async () => {
  const value = {
    ...run(),
    taskId: null,
    action: { type: "device.sync" as const, deviceId: crypto.randomUUID(), epoch: 1 },
  };
  const fetch = vi.fn(async () =>
    Response.json({ type: "synced", streamId: "stream", sequence: 13 }),
  );
  const transport = createCloudflareJobTransport({ RAYPX_RELAY: { getByName: () => ({ fetch }) } });
  expect(await transport.sync("account", value, new AbortController().signal)).toEqual({
    type: "synced",
    streamId: "stream",
    sequence: 13,
  });
  await expect(
    createCloudflareJobTransport({}).sync("account", value, new AbortController().signal),
  ).rejects.toMatchObject({ code: "CONTROL_UNAVAILABLE", uncertain: false });
});
