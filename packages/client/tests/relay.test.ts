import { expect, it, vi } from "vite-plus/test";
import { createTaskClient } from "../src/tasks.js";
import type { ApiClient } from "../src/index.js";

import { taskSchema } from "@raypx/core/tasks";

it("rejects an older server without downgrading and reconnects after an explicit account reset", async () => {
  const versions: number[] = [];
  let olderServer = true,
    observedReads = 0;
  const task = taskSchema.parse({
    id: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    provider: "codex",
    mode: "run",
    prompt: "synthetic",
    status: "cancelled",
    summary: "",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  class Socket extends EventTarget {
    readyState = 1;
    bufferedAmount = 0;
    constructor() {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    close(code = 1000) {
      this.readyState = 3;
      this.dispatchEvent(new CloseEvent("close", { code }));
    }
    send(data: string) {
      const frame = JSON.parse(data);
      const reply = (value: unknown) =>
        queueMicrotask(() =>
          this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) })),
        );
      if (frame.type === "auth") {
        versions.push(frame.protocolVersion);
        if (olderServer && frame.protocolVersion === 3) this.close(4006);
        else reply({ type: "ready", role: "viewer", protocolVersion: frame.protocolVersion });
      }
      if (frame.type === "request")
        reply({ type: "result", id: frame.id, result: { ok: true, value: task } });
    }
  }
  const api = {
    relay: { ticket: async () => ({ token: "a".repeat(64) }) },
    tasks: { list: async () => [] },
    observed: {
      list: async () => {
        observedReads++;
        if (olderServer) throw new Error("old API must not be called after negotiation");
        return { sessions: [], requests: [] };
      },
    },
  } as unknown as ApiClient;
  const client = createTaskClient(api, {
    baseUrl: "https://api.example.test",
    socket: () => new Socket() as unknown as WebSocket,
  });
  vi.useFakeTimers();
  let release = () => {};
  try {
    client.setAccount("account");
    release = client.subscribe(() => {});
    // Drive the complete retry windows without racing the polling deadline.
    await vi.advanceTimersByTimeAsync(500);
    expect(versions).toEqual([3]);
    await expect(client.tasks.cancel({ id: task.id })).rejects.toMatchObject({
      data: { error: { code: "UPGRADE_REQUIRED" } },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(versions).toEqual([3]);
    expect(observedReads).toBe(0);
    olderServer = false;
    client.setAccount(null);
    client.setAccount("account");
    await vi.advanceTimersByTimeAsync(0);
    expect(versions).toEqual([3, 3]);
    expect(await client.tasks.cancel({ id: task.id })).toMatchObject({
      id: task.id,
      status: "cancelled",
    });
    await client.observed!.list({});
    expect(observedReads).toBe(1);
  } finally {
    release();
    client.setAccount(null);
    vi.useRealTimers();
  }
});

it("requires explicit context support and renegotiates it on every connection", async () => {
  let supportsContext = false,
    disconnect = () => {};
  const sent: unknown[] = [];
  const task = taskSchema.parse({
    id: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    provider: "codex",
    mode: "run",
    prompt: "A contextual task",
    status: "succeeded",
    summary: "Done",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  class Socket extends EventTarget {
    readyState = 1;
    bufferedAmount = 0;
    constructor() {
      super();
      disconnect = () => this.close(1012);
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    close(code = 1000) {
      this.readyState = 3;
      this.dispatchEvent(new CloseEvent("close", { code }));
    }
    send(raw: string) {
      const frame = JSON.parse(raw);
      const reply = (value: unknown) =>
        queueMicrotask(() =>
          this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) })),
        );
      if (frame.type === "auth")
        reply({
          type: "ready",
          role: "viewer",
          protocolVersion: 3,
          ...(supportsContext ? { contextSupported: true } : {}),
        });
      if (frame.type === "request") {
        sent.push(frame);
        reply({
          type: "result",
          id: frame.id,
          result: { ok: true, value: { ...task, id: frame.request.input.id } },
        });
      }
    }
  }
  const api = {
    relay: { ticket: async () => ({ token: "a".repeat(64) }) },
    tasks: { list: async () => [] },
  } as unknown as ApiClient;
  const client = createTaskClient(api, {
    baseUrl: "https://api.example.test",
    socket: () => new Socket() as unknown as WebSocket,
  });
  const input = {
    id: task.id,
    deviceId: task.deviceId,
    projectId: task.projectId,
    provider: task.provider,
    mode: task.mode,
    prompt: task.prompt,
  };
  const selection = { sources: [{ id: crypto.randomUUID(), revision: 1 }] };
  vi.useFakeTimers();
  let release = () => {};
  try {
    client.setAccount("account");
    release = client.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    await expect(
      client.tasks.create({ ...input, contextSelection: selection }),
    ).rejects.toMatchObject({ data: { error: { code: "UPGRADE_REQUIRED" } } });
    expect(sent).toEqual([]);
    await client.tasks.create(input);
    expect(sent).toHaveLength(1);
    supportsContext = true;
    disconnect();
    await vi.advanceTimersByTimeAsync(1000);
    await client.tasks.create({ ...input, id: crypto.randomUUID(), contextSelection: selection });
    expect(sent).toHaveLength(2);
    supportsContext = false;
    disconnect();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(
      client.tasks.create({ ...input, id: crypto.randomUUID(), contextSelection: selection }),
    ).rejects.toMatchObject({ data: { error: { code: "UPGRADE_REQUIRED" } } });
    expect(sent).toHaveLength(2);
  } finally {
    release();
    client.setAccount(null);
    vi.useRealTimers();
  }
});
