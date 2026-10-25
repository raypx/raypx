import { describe, expect, it, vi } from "vite-plus/test";
import { ControlService } from "../../server/control/service.js";
import {
  connected,
  controlAuth,
  humanRequest,
  memoryControlRepository,
  running,
} from "../helpers/control.js";

describe("Desktop-owned task projections", () => {
  it("bounds replay and removes orphans without deleting conversation history absent from a snapshot", async () => {
    const repository = memoryControlRepository(),
      service = new ControlService(repository),
      f = await connected(service),
      task = await running(service, f);
    const now = new Date().toISOString();
    const entry = {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "message" as const,
      order: 1,
      revision: 1,
      text: "Retained history",
      status: "complete" as const,
      truncated: false,
      createdAt: now,
      updatedAt: now,
    };
    await service.events(f.actor, f.announce.streamId, [
      { sequence: 2, event: { id: crypto.randomUUID(), taskId: task.id, kind: "activity", entry } },
      {
        sequence: 3,
        event: {
          id: crypto.randomUUID(),
          taskId: task.id,
          kind: "status",
          status: "succeeded",
          summary: "Done",
        },
      },
    ]);
    const streamId = crypto.randomUUID();
    await service.announce(f.actor, { ...f.announce, streamId });
    await repository.transaction(f.auth.user.id, async (tx) => {
      for (let cursor = 1; cursor <= 5000; cursor++)
        await tx.put("event", {
          id: `replay-${cursor}`,
          deviceId: task.deviceId,
          taskId: task.id,
          streamId,
          cursor,
          event: {
            id: `event-${cursor}`,
            taskId: task.id,
            kind: "status",
            status: "succeeded",
            summary: "x".repeat(2048),
          },
        });
      await tx.put("event", {
        id: "orphan",
        deviceId: task.deviceId,
        taskId: "missing",
        streamId,
        cursor: 5001,
        event: { kind: "activity" },
      });
    });
    await service.snapshot(f.actor, streamId, 5001, []);
    const rows = await repository.read(f.auth.user.id, (tx) =>
      tx.list<{ id: string; deviceId: string; streamId: string; event: { kind: string } }>(
        "event",
        task.deviceId,
      ),
    );
    const replay = rows.filter((row) => row.event.kind !== "activity");
    expect(replay.length).toBeLessThanOrEqual(4096);
    expect(
      replay.reduce((bytes, row) => bytes + Buffer.byteLength(JSON.stringify(row)), 0),
    ).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(replay.every((row) => row.streamId === streamId)).toBe(true);
    expect(rows.some((row) => row.id === "orphan")).toBe(false);
    const result = await service.getTask(f.auth.user.id, task.id, 0);
    expect(result.task.status).toBe("succeeded");
    expect(result.activity).toEqual([entry]);
  });
  it("applies deltas atomically, requires a baseline and reads without the write transaction", async () => {
    const repository = memoryControlRepository(),
      service = new ControlService(repository),
      f = await connected(service),
      task = await running(service, f);
    const entry = {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "message" as const,
      order: 1,
      revision: 1,
      text: "Hello",
      status: "streaming" as const,
      truncated: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await service.events(f.actor, f.announce.streamId, [
      { sequence: 2, event: { id: crypto.randomUUID(), taskId: task.id, kind: "activity", entry } },
    ]);
    const delta = {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "activity_delta" as const,
      entryId: entry.id,
      baseRevision: 1,
      revision: 2,
      append: " world",
      updatedAt: entry.updatedAt,
      truncated: false,
    };
    await service.events(f.actor, f.announce.streamId, [{ sequence: 3, event: delta }]);
    await expect(
      service.events(f.actor, f.announce.streamId, [
        { sequence: 4, event: { ...delta, id: crypto.randomUUID(), baseRevision: 3, revision: 4 } },
      ]),
    ).rejects.toMatchObject({ code: "ACTIVITY_BASE_MISMATCH" });
    const write = vi
      .spyOn(repository, "transaction")
      .mockRejectedValue(new Error("Write lock unavailable"));
    try {
      expect((await service.getTask(f.auth.user.id, task.id, 0)).activity).toMatchObject([
        { text: "Hello world", revision: 2 },
      ]);
    } finally {
      write.mockRestore();
    }
  });
  it("routes task inputs by owner and retains only the latest conversation revision with paging", async () => {
    const repository = memoryControlRepository(),
      service = new ControlService(repository),
      f = await connected(service),
      task = await running(service, f);
    const id = crypto.randomUUID(),
      input = { id, taskId: task.id, mode: "queue" as const, prompt: "Next instruction" };
    expect(
      (await service.route(f.auth.user.id, id, { method: "tasks.input", input })).deviceId,
    ).toBe(task.deviceId);
    await expect(
      service.route("other", id, { method: "tasks.input", input }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.route(f.auth.user.id, crypto.randomUUID(), { method: "tasks.input", input }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const entry = {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "message" as const,
      order: 1,
      revision: 1,
      text: "Draft",
      status: "streaming" as const,
      truncated: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const event = { id: crypto.randomUUID(), taskId: task.id, kind: "activity" as const, entry };
    await service.events(f.actor, f.announce.streamId, [
      { sequence: 2, event },
      {
        sequence: 3,
        event: {
          ...event,
          id: crypto.randomUUID(),
          entry: { ...entry, revision: 2, text: "Final", status: "complete" },
        },
      },
    ]);
    const result = await service.getTask(f.auth.user.id, task.id, 0);
    expect(result.activity).toEqual([expect.objectContaining({ revision: 2, text: "Final" })]);
    expect(result.events.every((item) => item.event.kind !== "activity")).toBe(true);
    const persisted = await repository.transaction(f.auth.user.id, (tx) => tx.list("event"));
    expect(persisted).toHaveLength(2);
    await service.snapshot(f.actor, f.announce.streamId, 3, [
      { kind: "task", task },
      { kind: "activity", entry },
    ]);
    expect((await service.getTask(f.auth.user.id, task.id, 0)).activity[0]?.revision).toBe(2);
    expect((await service.getTask(f.auth.user.id, task.id, 0, 1)).activity).toEqual([]);
    await expect(service.getTask("other", task.id, 0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.events(f.actor, f.announce.streamId, [
        {
          sequence: 4,
          event: { ...event, entry: { ...entry, revision: 2, text: "Changed same revision" } },
        },
      ]),
    ).rejects.toMatchObject({ code: "EVENT_CONFLICT" });
  });
  it("routes an owned command without inventing task or approval state in the cloud", async () => {
    const service = new ControlService(memoryControlRepository()),
      f = await connected(service);
    const command = await service.route(f.auth.user.id, f.input.id, {
      method: "tasks.create",
      input: f.input,
    });
    expect(command.deviceId).toBe(f.grant.deviceId);
    expect(await service.listTasks(f.auth.user.id, { limit: 100 })).toEqual([]);
    await expect(
      service.route("other", f.input.id, { method: "tasks.create", input: f.input }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("retains completion events uploaded after a disconnect and intervening reads", async () => {
    let now = Date.now();
    const service = new ControlService(memoryControlRepository(), () => now),
      f = await connected(service),
      task = await running(service, f);
    now += 61_000;
    await service.listTasks(f.auth.user.id, { limit: 100 });
    expect((await service.getTask(f.auth.user.id, task.id, 0)).task.status).toBe("running");
    const event = {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "status" as const,
      status: "succeeded" as const,
      summary: "Recovered result",
      task: { ...task, status: "succeeded" as const, summary: "Recovered result" },
    };
    await service.events(f.actor, f.announce.streamId, [{ sequence: 2, event }]);
    expect((await service.getTask(f.auth.user.id, task.id, 0)).task).toMatchObject({
      status: "succeeded",
      summary: "Recovered result",
    });
  });
  it("does not interrupt a task merely because the host instance changed", async () => {
    const service = new ControlService(memoryControlRepository()),
      f = await connected(service),
      task = await running(service, f);
    const next = await service.authenticate("device", f.grant.token, crypto.randomUUID());
    const resume = await service.announce(next, { ...f.announce, instanceId: crypto.randomUUID() });
    expect(resume.sequence).toBe(1);
    expect((await service.getTask(f.auth.user.id, task.id, 0)).task.status).toBe("running");
    await service.events(next, f.announce.streamId, [
      {
        sequence: 2,
        event: {
          id: crypto.randomUUID(),
          taskId: task.id,
          kind: "status",
          status: "succeeded",
          summary: "Done",
        },
      },
    ]);
    expect((await service.getTask(f.auth.user.id, task.id, 0)).task.status).toBe("succeeded");
  });
  it("deduplicates events and fences late messages and disconnects from an old connection", async () => {
    const service = new ControlService(memoryControlRepository()),
      f = await connected(service),
      task = await running(service, f);
    const event = {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "status" as const,
      status: "succeeded" as const,
      summary: "Done",
    };
    for (let i = 0; i < 2; i++)
      await service.events(f.actor, f.announce.streamId, [{ sequence: 2, event }]);
    expect((await service.getTask(f.auth.user.id, task.id, 0)).events).toHaveLength(2);
    await expect(
      service.events(f.actor, f.announce.streamId, [
        { sequence: 2, event: { ...event, summary: "Changed" } },
      ]),
    ).rejects.toMatchObject({ code: "EVENT_CONFLICT" });
    const next = await service.authenticate("device", f.grant.token, crypto.randomUUID());
    await service.announce(next, f.announce);
    await service.touch(next);
    await service.disconnect(f.actor);
    expect((await service.listDevices(f.auth.user.id))[0]?.online).toBe(true);
    await expect(
      service.events(f.actor, f.announce.streamId, [{ sequence: 3, event }]),
    ).rejects.toMatchObject({ code: "DEVICE_REPLACED" });
  });
  it("uses a full host snapshot after a replay gap and ignores older journal records", async () => {
    const service = new ControlService(memoryControlRepository()),
      f = await connected(service),
      task = await running(service, f);
    await service.snapshot(f.actor, f.announce.streamId, 5000, [
      { kind: "task", task: { ...task, status: "succeeded", summary: "Compacted result" } },
    ]);
    await service.events(f.actor, f.announce.streamId, [
      {
        sequence: 2,
        event: {
          id: crypto.randomUUID(),
          taskId: task.id,
          kind: "status",
          status: "running",
          summary: "Stale",
        },
      },
    ]);
    expect((await service.getTask(f.auth.user.id, task.id, 0)).task.summary).toBe(
      "Compacted result",
    );
  });
  it("requests another full snapshot after an interrupted initial transfer", async () => {
    const service = new ControlService(memoryControlRepository()),
      f = await connected(service),
      announce = { ...f.announce, streamId: crypto.randomUUID() };
    expect((await service.announce(f.actor, announce)).snapshot).toBe(true);
    await service.disconnect(f.actor);
    const next = await service.authenticate("device", f.grant.token, crypto.randomUUID());
    expect((await service.announce(next, announce)).snapshot).toBe(true);
    await service.snapshot(next, announce.streamId, 0, []);
    expect((await service.announce(next, announce)).snapshot).toBe(false);
  });
  it("removes stale approvals when the host snapshot has lost their active task", async () => {
    const service = new ControlService(memoryControlRepository()),
      f = await connected(service),
      task = await running(service, f),
      request = humanRequest(task);
    await service.events(f.actor, f.announce.streamId, [
      {
        sequence: 2,
        event: { id: crypto.randomUUID(), taskId: task.id, kind: "request", request },
      },
    ]);
    await service.snapshot(f.actor, f.announce.streamId, 2, []);
    const detail = await service.getTask(f.auth.user.id, task.id, 0);
    expect(detail.task.status).toBe("interrupted");
    expect(detail.requests[0]?.status).toBe("cancelled");
    expect(await service.listApprovals(f.auth.user.id)).toEqual([]);
  });
  it("keeps approvals as device projections and resolves their command route within the account", async () => {
    const service = new ControlService(memoryControlRepository()),
      f = await connected(service),
      task = await running(service, f),
      request = humanRequest(task);
    await service.events(f.actor, f.announce.streamId, [
      {
        sequence: 2,
        event: { id: crypto.randomUUID(), taskId: task.id, kind: "request", request },
      },
    ]);
    expect((await service.listApprovals(f.auth.user.id))[0]?.status).toBe("pending");
    const command = await service.route(f.auth.user.id, crypto.randomUUID(), {
      method: "approvals.decide",
      input: { id: request.id, decision: { type: "allow" } },
    });
    expect(command.deviceId).toBe(task.deviceId);
    expect((await service.listApprovals(f.auth.user.id))[0]?.status).toBe("pending");
    await expect(
      service.route("other", crypto.randomUUID(), command.request),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects a device publishing another device's task or request", async () => {
    const service = new ControlService(memoryControlRepository()),
      f = await connected(service),
      task = await running(service, f),
      other = await connected(service);
    await expect(
      service.events(other.actor, other.announce.streamId, [
        {
          sequence: 1,
          event: {
            id: crypto.randomUUID(),
            taskId: task.id,
            kind: "status",
            status: "failed",
            summary: "",
          },
        },
      ]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.snapshot(other.actor, other.announce.streamId, 1, [{ kind: "task", task }]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("uses one-time viewer tickets and validates parent sessions after authentication", async () => {
    const repository = memoryControlRepository(),
      service = new ControlService(repository),
      auth = controlAuth();
    const ticket = await service.ticket(auth),
      actor = await service.authenticate("viewer", ticket.token, crypto.randomUUID());
    await expect(
      service.authenticate("viewer", ticket.token, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    repository.validSession = false;
    await expect(service.validate(actor)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
  it("binds device grants to their role and epoch and requires explicit reconnect after revocation", async () => {
    const service = new ControlService(memoryControlRepository()),
      f = await connected(service);
    await expect(
      service.authenticate("viewer", f.grant.token, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await service.revoke(f.auth.user.id, { deviceId: f.grant.deviceId, epoch: f.grant.epoch });
    await expect(service.validate(f.actor)).rejects.toMatchObject({ code: "DEVICE_REVOKED" });
    await expect(
      service.register(f.auth, {
        installationId: f.installationId,
        name: "Computer",
        platform: "darwin",
        appVersion: "0.1.0",
        reconnect: false,
      }),
    ).rejects.toMatchObject({ code: "DEVICE_REVOKED" });
    const fresh = await service.register(f.auth, {
      installationId: f.installationId,
      name: "Computer",
      platform: "darwin",
      appVersion: "0.1.0",
      reconnect: true,
    });
    expect(fresh.epoch).toBe(f.grant.epoch + 1);
  });
  it("replays only events after the viewer's acknowledged cursor", async () => {
    const service = new ControlService(memoryControlRepository()),
      f = await connected(service),
      task = await running(service, f);
    await service.events(f.actor, f.announce.streamId, [
      {
        sequence: 2,
        event: {
          id: crypto.randomUUID(),
          taskId: task.id,
          kind: "status",
          status: "succeeded",
          summary: "Done",
        },
      },
    ]);
    const frames = await service.replay(f.auth.user.id, [
      { deviceId: task.deviceId, streamId: f.announce.streamId, sequence: 1 },
    ]);
    expect(frames[0]?.events?.map((item) => item.sequence)).toEqual([2]);
    expect(await service.replay("other", [])).toEqual([]);
  });
  it("refreshes the projection when replayed events would exceed one relay frame", async () => {
    const service = new ControlService(memoryControlRepository()),
      f = await connected(service),
      task = await running(service, f),
      summary = "x".repeat(32_000);
    await service.events(
      f.actor,
      f.announce.streamId,
      Array.from({ length: 20 }, (_, index) => ({
        sequence: index + 2,
        event: {
          id: crypto.randomUUID(),
          taskId: task.id,
          kind: "status" as const,
          status: task.status,
          summary,
          task: { ...task, summary },
        },
      })),
    );
    const frames = await service.replay(f.auth.user.id, [
      { deviceId: task.deviceId, streamId: f.announce.streamId, sequence: 1 },
    ]);
    expect(frames[0]).toMatchObject({ reset: true, sequence: 21 });
    expect(frames[0]?.events).toBeUndefined();
  });
});
