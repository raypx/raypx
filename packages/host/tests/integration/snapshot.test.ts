import { expect, it } from "vite-plus/test";
import { type RelayServerFrame } from "@raypx/contracts/tasks";
import { hostFixtures } from "../helpers/control.js";
const { control } = hostFixtures();

it("uses a complete snapshot when the replay cursor falls behind retained events", async () => {
  const f = await control();
  const task = {
    id: crypto.randomUUID(),
    deviceId: f.grant.deviceId,
    projectId: crypto.randomUUID(),
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Task",
    status: "succeeded" as const,
    summary: "Restored",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  f.journal.push({
    sequence: 5000,
    event: {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "status",
      status: "succeeded",
      summary: task.summary,
      task,
    },
  });
  f.records.push({ kind: "task", task });
  f.setFloor(5000);
  await f.value.wake();
  const snapshots = f.frames.filter((frame) => frame.type === "snapshot");
  expect(snapshots.at(-1)).toMatchObject({ sequence: 5000, records: [{ kind: "task", task }] });
});

it("keeps snapshot requests arriving during a flush and ignores duplicate old snapshot ACKs", async () => {
  const f = await control(),
    announce = f.frames.find((frame) => frame.type === "announce")!;
  if (announce.type !== "announce") throw new Error("Missing announcement");
  expect(announce.syncSupported).toBe(true);
  const original = f.request.getMockImplementation()!;
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
  let block = true;
  f.request.mockImplementation(async (method, params) => {
    if (method === "agents.snapshot" && block) {
      block = false;
      entered();
      await gate;
    }
    return original(method, params);
  });
  const peer = [...f.sockets][0]!,
    send = peer.send;
  let secondAck: Extract<RelayServerFrame, { type: "ack" }> | undefined;
  const firstId = crypto.randomUUID(),
    secondId = crypto.randomUUID();
  peer.send = (frame) => {
    if (frame.type === "ack" && frame.snapshotId) {
      const snapshot = f.frames.find(
        (value) => value.type === "snapshot" && value.id === frame.snapshotId,
      );
      if (snapshot?.type === "snapshot" && snapshot.syncId === secondId) {
        secondAck = frame;
        return;
      }
    }
    send(frame);
  };
  send({
    type: "resume",
    streamId: announce.streamId,
    sequence: 0,
    snapshot: true,
    syncId: firstId,
  });
  await reached;
  send({
    type: "resume",
    streamId: announce.streamId,
    sequence: 0,
    snapshot: true,
    syncId: secondId,
  });
  release();
  await expect.poll(() => Boolean(secondAck)).toBe(true);
  const snapshots = f.frames.filter((frame) => frame.type === "snapshot" && frame.syncId);
  expect(snapshots.map((frame) => (frame.type === "snapshot" ? frame.syncId : undefined))).toEqual([
    firstId,
    secondId,
  ]);
  const first = snapshots[0]!;
  if (first.type !== "snapshot") throw new Error("Missing snapshot");
  const checkpoints = f.request.mock.calls.filter(
    ([method]) => method === "agents.checkpoint",
  ).length;
  send({
    type: "ack",
    streamId: announce.streamId,
    sequence: first.sequence,
    snapshotId: first.id,
  });
  await Bun.sleep(20);
  expect(f.request.mock.calls.filter(([method]) => method === "agents.checkpoint")).toHaveLength(
    checkpoints,
  );
  send(secondAck!);
  await f.value.wake();
  expect(f.value.info("account").connected).toBe(true);
  expect(f.frames.filter((frame) => frame.type === "auth")).toHaveLength(1);
  expect(f.request.mock.calls.some(([method]) => method === "agents.detach")).toBe(false);
});

it("takes a requested snapshot without interrupting an in-flight durable command", async () => {
  const f = await control(),
    announce = f.frames.find((frame) => frame.type === "announce")!;
  if (announce.type !== "announce") throw new Error("Missing announcement");
  const original = f.request.getMockImplementation()!;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.request.mockImplementation(async (method, params) =>
    method === "agents.remote"
      ? gate.then(() => ({ ok: true, value: { accepted: true } }))
      : original(method, params),
  );
  const peer = [...f.sockets][0]!,
    routeId = crypto.randomUUID();
  peer.send({
    type: "command",
    routeId,
    command: {
      id: crypto.randomUUID(),
      deviceId: f.grant.deviceId,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      request: { method: "tasks.cancel", input: { id: crypto.randomUUID() } },
    },
  });
  await expect
    .poll(() => f.request.mock.calls.some(([method]) => method === "agents.remote"))
    .toBe(true);
  const syncId = crypto.randomUUID();
  peer.send({ type: "resume", streamId: announce.streamId, sequence: 0, snapshot: true, syncId });
  await expect
    .poll(() =>
      f.frames.some((frame) => frame.type === "snapshot" && frame.syncId === syncId && frame.done),
    )
    .toBe(true);
  expect(f.frames.some((frame) => frame.type === "result" && frame.routeId === routeId)).toBe(
    false,
  );
  release();
  await expect
    .poll(
      () => f.frames.filter((frame) => frame.type === "result" && frame.routeId === routeId).length,
    )
    .toBe(1);
  expect(f.frames.filter((frame) => frame.type === "auth")).toHaveLength(1);
  expect(f.request.mock.calls.some(([method]) => method === "agents.detach")).toBe(false);
});
