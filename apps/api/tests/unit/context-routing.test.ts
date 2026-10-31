import { expect, it, vi } from "vite-plus/test";
import { ContextError } from "@raypx/memory";
import { taskExecutionPrompt, type TaskContextSnapshot } from "@raypx/core/tasks";
import { ControlService } from "../../server/control/service.js";
import { connected, memoryControlRepository } from "../helpers/control.js";
import { RelayHub } from "../../server/relay/hub.js";
import type { RelayServerFrame } from "@raypx/contracts/tasks";

function snapshot(): TaskContextSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    sources: [
      {
        id: crypto.randomUUID(),
        revision: 1,
        kind: "memory",
        name: "Project rules",
        content: "Run focused tests before completion.",
        scope: "account",
        project: null,
      },
    ],
  };
}
it("freezes the first authoritative context before dispatch and reuses it on retry", async () => {
  const captured = snapshot();
  const resolve = vi.fn(async () => structuredClone(captured));
  const repository = memoryControlRepository();
  const control = new ControlService(repository, Date.now, resolve);
  const f = await connected(control);
  const input = {
    ...f.input,
    contextSelection: { sources: captured.sources.map(({ id, revision }) => ({ id, revision })) },
  };
  const request = { method: "tasks.create" as const, input };
  const first = await control.route(f.auth.user.id, input.id, request);
  expect(first.context).toEqual(captured);
  expect(resolve).toHaveBeenCalledWith(
    f.auth.user.id,
    input.contextSelection,
    {
      deviceId: input.deviceId,
      projectId: input.projectId,
    },
    input.prompt,
  );
  resolve.mockRejectedValue(new ContextError("CONTEXT_ARCHIVED"));
  const repeat = await control.route(f.auth.user.id, input.id, request);
  expect(repeat.context).toEqual(first.context);
  expect(resolve).toHaveBeenCalledTimes(1);
  await expect(
    control.route(f.auth.user.id, input.id, {
      method: "tasks.create",
      input: { ...input, prompt: "Changed request" },
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await expect(control.route("another-account", input.id, request)).rejects.toMatchObject({
    code: "CONTEXT_ARCHIVED",
  });
  expect(resolve).toHaveBeenLastCalledWith(
    "another-account",
    input.contextSelection,
    {
      deviceId: input.deviceId,
      projectId: input.projectId,
    },
    input.prompt,
  );
});

it("refuses unavailable or oversized context before reserving any command", async () => {
  const repository = memoryControlRepository();
  const control = new ControlService(repository);
  const f = await connected(control);
  const captured = snapshot();
  const input = {
    ...f.input,
    contextSelection: { sources: [{ id: captured.sources[0]!.id, revision: 1 }] },
  };
  await expect(
    control.route(f.auth.user.id, input.id, { method: "tasks.create", input }),
  ).rejects.toMatchObject({ code: "CONTEXT_UNAVAILABLE" });
  const resolver = new ControlService(
    repository,
    Date.now,
    async (_owner, _selection, _target, prompt) => {
      taskExecutionPrompt({ prompt, context: captured });
      return captured;
    },
  );
  await expect(
    resolver.route(f.auth.user.id, input.id, {
      method: "tasks.create",
      input: { ...input, prompt: "x".repeat(32_000) },
    }),
  ).rejects.toMatchObject({ code: "CONTEXT_TOO_LARGE" });
  expect(await repository.read(f.auth.user.id, (tx) => tx.list("command"))).toEqual([]);
});

it("validates context projects by account and keeps revoked targets ineligible", async () => {
  const control = new ControlService(memoryControlRepository());
  const f = await connected(control);
  await expect(control.validateContextProject(f.auth.user.id, f.input)).resolves.toBeUndefined();
  await expect(control.validateContextProject("other", f.input)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    control.validateContextProject(f.auth.user.id, { ...f.input, projectId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await control.revoke(f.auth.user.id, { deviceId: f.input.deviceId, epoch: f.grant.epoch });
  await expect(control.validateContextProject(f.auth.user.id, f.input)).rejects.toMatchObject({
    code: "DEVICE_REVOKED",
  });
});

it("reclaims an accepted command snapshot and recovers the task without another host dispatch", async () => {
  const captured = snapshot(),
    repository = memoryControlRepository();
  const resolve = vi.fn(async () => captured);
  const control = new ControlService(repository, Date.now, resolve);
  const f = await connected(control);
  const hub = new RelayHub(async (run) => run(control));
  const host = crypto.randomUUID(),
    viewer = crypto.randomUUID();
  const frames: RelayServerFrame[] = [],
    answers: RelayServerFrame[] = [];
  hub.open({ id: host, send: (frame) => frames.push(frame), close() {} });
  hub.open({ id: viewer, send: (frame) => answers.push(frame), close() {} });
  try {
    await hub.receive(
      host,
      JSON.stringify({ type: "auth", protocolVersion: 4, role: "device", token: f.grant.token }),
    );
    await hub.receive(host, JSON.stringify(f.announce));
    await hub.receive(host, JSON.stringify({ type: "available" }));
    const ticket = await control.ticket(f.auth);
    await hub.receive(
      viewer,
      JSON.stringify({ type: "auth", protocolVersion: 4, role: "viewer", token: ticket.token }),
    );
    const input = {
      ...f.input,
      contextSelection: { sources: captured.sources.map(({ id, revision }) => ({ id, revision })) },
    };
    const frame = { type: "request", id: input.id, request: { method: "tasks.create", input } };
    await hub.receive(viewer, JSON.stringify(frame));
    const command = frames.find((item) => item.type === "command")!;
    const task = {
      ...f.input,
      status: "running" as const,
      summary: "",
      parentTaskId: null,
      context: command.command.context!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await hub.receive(
      host,
      JSON.stringify({
        type: "events",
        streamId: f.announce.streamId,
        events: [
          {
            sequence: 1,
            event: {
              id: crypto.randomUUID(),
              taskId: task.id,
              kind: "status",
              status: task.status,
              summary: task.summary,
              task,
            },
          },
        ],
      }),
    );
    await hub.receive(
      host,
      JSON.stringify({
        type: "result",
        routeId: command.routeId,
        result: { ok: true, value: task },
      }),
    );
    expect(
      await repository.read(f.auth.user.id, (tx) => tx.get("command", task.id)),
    ).toBeUndefined();
    resolve.mockRejectedValue(new ContextError("CONTEXT_ARCHIVED"));
    await hub.close(host);
    await hub.receive(viewer, JSON.stringify(frame));
    expect(answers.at(-1)).toMatchObject({
      type: "result",
      id: task.id,
      result: { ok: true, value: { id: task.id, context: captured } },
    });
    expect(frames.filter((item) => item.type === "command")).toHaveLength(1);
    expect(resolve).toHaveBeenCalledTimes(1);
    await expect(
      control.route(f.auth.user.id, task.id, {
        method: "tasks.create",
        input: { ...input, prompt: "Different task" },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  } finally {
    await hub.shutdown();
  }
});

it("compacts unknown delivery into a private-content-free receipt and never resolves it again", async () => {
  const captured = snapshot(),
    repository = memoryControlRepository();
  let now = Date.now();
  const resolve = vi.fn(async () => captured);
  const control = new ControlService(repository, () => now, resolve);
  const f = await connected(control);
  const input = {
    ...f.input,
    contextSelection: { sources: captured.sources.map(({ id, revision }) => ({ id, revision })) },
  };
  const request = { method: "tasks.create" as const, input };
  await control.route(f.auth.user.id, input.id, request);
  now += 25 * 60 * 60 * 1000;
  await repository.transaction(f.auth.user.id, (tx) => tx.pruneCommands(new Date(now)));
  const receipt = await repository.read(f.auth.user.id, (tx) => tx.get("command", input.id));
  expect(receipt).toMatchObject({ id: input.id, compacted: true });
  expect(JSON.stringify(receipt)).not.toContain(captured.sources[0]!.content);
  expect(JSON.stringify(receipt)).not.toContain(input.prompt);
  await expect(control.route(f.auth.user.id, input.id, request)).rejects.toMatchObject({
    code: "CONTEXT_REQUEST_EXPIRED",
  });
  await expect(
    control.route(f.auth.user.id, input.id, {
      method: "tasks.create",
      input: { ...input, prompt: "Changed" },
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  expect(resolve).toHaveBeenCalledTimes(1);
});

it("forwards context to every current-protocol host", async () => {
  const captured = snapshot();
  const control = new ControlService(memoryControlRepository(), Date.now, async () => captured);
  const f = await connected(control);
  const hub = new RelayHub(async (run) => run(control));
  const deviceId = crypto.randomUUID(),
    viewerId = crypto.randomUUID();
  const deviceFrames: RelayServerFrame[] = [],
    viewerFrames: RelayServerFrame[] = [];
  hub.open({ id: deviceId, send: (frame) => deviceFrames.push(frame), close() {} });
  hub.open({ id: viewerId, send: (frame) => viewerFrames.push(frame), close() {} });
  try {
    await hub.receive(
      deviceId,
      JSON.stringify({ type: "auth", protocolVersion: 4, role: "device", token: f.grant.token }),
    );
    await hub.receive(deviceId, JSON.stringify(f.announce));
    await hub.receive(deviceId, JSON.stringify({ type: "available" }));
    const ticket = await control.ticket(f.auth);
    await hub.receive(
      viewerId,
      JSON.stringify({ type: "auth", protocolVersion: 4, role: "viewer", token: ticket.token }),
    );
    const input = {
      ...f.input,
      contextSelection: {
        sources: captured.sources.map(({ id, revision }) => ({ id, revision })),
      },
    };
    await hub.receive(
      viewerId,
      JSON.stringify({
        type: "request",
        id: input.id,
        request: { method: "tasks.create", input },
      }),
    );
    const command = deviceFrames.find((frame) => frame.type === "command");
    expect(command?.command.context).toEqual(captured);
    await hub.receive(
      deviceId,
      JSON.stringify({
        type: "result",
        routeId: command!.routeId,
        result: { ok: false, code: "CONTEXT_TOO_LARGE" },
      }),
    );
    expect(viewerFrames).toContainEqual({
      type: "result",
      id: input.id,
      result: { ok: false, code: "CONTEXT_TOO_LARGE" },
    });
  } finally {
    await hub.shutdown();
  }
});
