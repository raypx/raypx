import { afterEach, expect, it, vi } from "vite-plus/test";
import type { AgentTask } from "@raypx/contracts/tasks";
import { LOCAL_WORKSPACE_ID, type LocalEvent, type LocalMethod } from "@raypx/contracts/local";
import {
  createLocalTaskClient,
  createPendingClient,
} from "../../../../../src/features/tasks/local-client";
import { createLocalClient } from "@raypx/contracts/local-client";

afterEach(() => vi.unstubAllGlobals());
const task: AgentTask = {
  id: crypto.randomUUID(),
  deviceId: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  provider: "codex",
  mode: "run",
  prompt: "Only local",
  status: "running",
  summary: "",
  parentTaskId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
it("keeps the device owner stable across login, account switches and logout", async () => {
  const request = vi.fn(async () => [task]);
  const client = createLocalTaskClient(createLocalClient(request), () => () => {}, {
    owner: LOCAL_WORKSPACE_ID,
  });
  for (const account of [null, "account-a", "account-b", null]) {
    client.setAccount(account);
    await client.tasks.list({ limit: 100 });
  }
  expect(request.mock.calls).toHaveLength(4);
  expect(request).toHaveBeenCalledWith("agents.local.list", {
    accountId: LOCAL_WORKSPACE_ID,
    limit: 100,
  });
});
it("uses only scoped IPC for queries and mutations even when network access fails", async () => {
  const network = vi.fn(() => {
    throw new Error("Network unavailable");
  });
  vi.stubGlobal("fetch", network);
  vi.stubGlobal("WebSocket", network);
  const calls: { method: LocalMethod; params: unknown }[] = [];
  let listener: ((event: LocalEvent) => void) | undefined;
  const detach = vi.fn();
  const request = createLocalClient(async (method, params) => {
    calls.push({ method, params });
    if (method === "agents.local.list") return [task];
    if (method === "agents.local.device")
      return {
        id: task.deviceId,
        name: "Local",
        platform: "darwin",
        appVersion: "1.0.0",
        lastSeenAt: null,
        epoch: 1,
        revoked: false,
        online: true,
        projects: [],
        capabilities: [],
      };
    if (method === "agents.local.get") return { task, events: [], requests: [] };
    if (method === "agents.local.approvals") return [];
    return { ok: true, value: task };
  });
  const client = createLocalTaskClient(request, (next) => {
    listener = next;
    return detach;
  });
  await expect(client.tasks.list({ limit: 100 })).rejects.toMatchObject({
    data: { error: { code: "AUTH_REQUIRED" } },
  });
  client.setAccount("account-a");
  const changed = vi.fn(),
    stop = client.subscribe(changed);
  expect((await client.tasks.list({ limit: 100 }))[0]?.id).toBe(task.id);
  await client.devices.list({});
  await client.tasks.get({ id: task.id, after: 0 });
  await client.approvals.list({});
  await client.tasks.create(task);
  await client.tasks.followUp({
    id: crypto.randomUUID(),
    parentTaskId: task.id,
    prompt: "Continue",
  });
  await client.tasks.cancel({ id: task.id });
  listener?.({ version: 1, event: "agent.changed", data: {} });
  expect(changed).toHaveBeenCalled();
  expect(
    calls.every(
      (call) =>
        call.method.startsWith("agents.local.") &&
        (call.params as { accountId: string }).accountId === "account-a",
    ),
  ).toBe(true);
  expect(network).not.toHaveBeenCalled();
  stop();
  expect(detach).toHaveBeenCalledTimes(1);
});
it("rejects old account responses and preserves host error codes", async () => {
  let resolve!: (value: unknown) => void;
  const request = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({ ok: false, code: "PROJECT_BUSY" });
  const client = createLocalTaskClient(createLocalClient(request), () => () => {});
  client.setAccount("account-a");
  const old = client.tasks.list({ limit: 100 });
  client.setAccount("account-b");
  resolve([task]);
  await expect(old).rejects.toMatchObject({ data: { error: { code: "AUTH_REQUIRED" } } });
  await expect(client.tasks.create(task)).rejects.toMatchObject({
    data: { error: { code: "PROJECT_BUSY" } },
  });
  const signal = AbortSignal.abort();
  await expect(client.tasks.create(task, { signal })).rejects.toBeDefined();
  expect(request).toHaveBeenCalledTimes(2);
});
it("counts local and remote approvals and tolerates one side failing", async () => {
  const approval = (id: string) => ({ id }) as never;
  const side = (list: () => Promise<never[]>) => {
    const stop = vi.fn();
    return {
      stop,
      client: {
        devices: { list: vi.fn() },
        tasks: {},
        approvals: { list, decide: vi.fn() },
        subscribe: vi.fn(() => stop),
      } as unknown as Parameters<typeof createPendingClient>[0],
    };
  };
  const local = side(async () => [approval("local")]);
  const remote = side(async () => [approval("remote")]);
  const pending = createPendingClient(local.client, remote.client);
  expect(await pending.approvals.list({})).toEqual([{ id: "local" }, { id: "remote" }]);
  pending.subscribe(() => {})();
  expect(local.stop).toHaveBeenCalled();
  expect(remote.stop).toHaveBeenCalled();
  const offline = side(async () => {
    throw new Error("offline");
  });
  expect(await createPendingClient(local.client, offline.client).approvals.list({})).toEqual([
    { id: "local" },
  ]);
  await expect(
    createPendingClient(offline.client, offline.client).approvals.list({}),
  ).rejects.toThrow("offline");
});
it("shares one command for identical in-flight cancels", async () => {
  let resolve!: (value: unknown) => void;
  const request = vi.fn(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const client = createLocalTaskClient(createLocalClient(request), () => () => {});
  client.setAccount("account-a");
  const first = client.tasks.cancel({ id: task.id }),
    second = client.tasks.cancel({ id: task.id });
  resolve({ ok: true, value: task });
  expect((await first).id).toBe(task.id);
  expect((await second).id).toBe(task.id);
  expect(request).toHaveBeenCalledTimes(1);
  resolve = () => {};
  const third = client.tasks.cancel({ id: task.id });
  resolve({ ok: true, value: task });
  await third;
  expect(request).toHaveBeenCalledTimes(2);
});

it("prefers the local epoch over a higher cloud revision and never retries uncertain decisions remotely", async () => {
  const remoteDecide = vi.fn();
  const request = { id: "request", epoch: "epoch", revision: 1 };
  const local = {
    observed: {
      list: vi.fn(async () => ({ sessions: [], requests: [request] })),
      get: vi.fn(async () => request),
      decide: vi.fn(async () => {
        throw new Error("uncertain");
      }),
    },
    approvals: { list: vi.fn() },
    subscribe: vi.fn(),
  } as unknown as Parameters<typeof createPendingClient>[0];
  const remote = {
    observed: {
      list: vi.fn(async () => ({ sessions: [], requests: [{ ...request, revision: 99 }] })),
      get: vi.fn(),
      decide: remoteDecide,
    },
    approvals: { list: vi.fn() },
    subscribe: vi.fn(),
  } as unknown as Parameters<typeof createPendingClient>[0];
  const client = createPendingClient(local, remote);
  expect((await client.observed!.list()).requests).toEqual([request]);
  expect(await client.observed!.get({ id: request.id })).toEqual(request);
  await expect(
    client.observed!.decide({ ...request, receiptId: "receipt", decision: { type: "allow" } }),
  ).rejects.toThrow("uncertain");
  expect(remoteDecide).not.toHaveBeenCalled();
});
