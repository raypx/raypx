import { expect, it, vi } from "vite-plus/test";
import { ContextError } from "@raypx/memory";
import type { TaskContextSnapshot } from "@raypx/core/tasks";
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
  expect(resolve).toHaveBeenCalledWith(f.auth.user.id, input.contextSelection, {
    deviceId: input.deviceId,
    projectId: input.projectId,
  });
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
  expect(resolve).toHaveBeenLastCalledWith("another-account", input.contextSelection, {
    deviceId: input.deviceId,
    projectId: input.projectId,
  });
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
  const resolver = new ControlService(repository, Date.now, async () => captured);
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

it.each([false, true])(
  "forwards context only to an explicitly capable host (%s)",
  async (supported) => {
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
        JSON.stringify({ type: "auth", protocolVersion: 3, role: "device", token: f.grant.token }),
      );
      await hub.receive(deviceId, JSON.stringify({ ...f.announce, contextSupported: supported }));
      await hub.receive(deviceId, JSON.stringify({ type: "available" }));
      const ticket = await control.ticket(f.auth);
      await hub.receive(
        viewerId,
        JSON.stringify({ type: "auth", protocolVersion: 3, role: "viewer", token: ticket.token }),
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
      expect(command?.command.context).toEqual(supported ? captured : undefined);
      if (supported) {
        await hub.receive(
          deviceId,
          JSON.stringify({
            type: "result",
            routeId: command!.routeId,
            result: { ok: false, code: "CONTEXT_TOO_LARGE" },
          }),
        );
      }
      expect(viewerFrames).toContainEqual({
        type: "result",
        id: input.id,
        result: { ok: false, code: supported ? "CONTEXT_TOO_LARGE" : "UPGRADE_REQUIRED" },
      });
    } finally {
      await hub.shutdown();
    }
  },
);
