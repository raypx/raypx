import { expect, it } from "vite-plus/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteControl } from "@raypx/host";
import { hostFixtures } from "../helpers/control.js";
const { control } = hostFixtures();

it("persists installation identity and account intent while keeping credentials off disk and URLs", async () => {
  const f = await control(),
    saved = readFileSync(join(f.directory, "remote-control.json"), "utf8");
  expect(saved).not.toContain(f.grant.token);
  expect(f.urls.every((url) => !url.includes(f.grant.token))).toBe(true);
  expect(f.frames[0]).toMatchObject({
    type: "auth",
    protocolVersion: 3,
    role: "device",
    token: f.grant.token,
  });
  const restored = new RemoteControl(
    f.directory,
    { request: async () => ({}) },
    () => {},
    () => {},
  );
  expect(restored.info("account").installationId).toBe(f.value.info("account").installationId);
});

it("pushes journal events on engine changes and checkpoints only after the relay acknowledges", async () => {
  const f = await control();
  const event = {
    id: crypto.randomUUID(),
    taskId: crypto.randomUUID(),
    kind: "status" as const,
    status: "succeeded" as const,
    summary: "Done",
  };
  f.journal.push({ sequence: 1, event });
  await f.value.wake();
  expect(f.frames.filter((frame) => frame.type === "events")).toHaveLength(1);
  expect(f.request).toHaveBeenCalledWith("agents.checkpoint", {
    binding: `account:${f.grant.deviceId}:1`,
    sequence: 1,
  });
  await f.value.wake();
  expect(f.frames.filter((frame) => frame.type === "events")).toHaveLength(1);
});

it("reconnects and sends only events after the server cursor without detaching local execution", async () => {
  const f = await control(),
    taskId = crypto.randomUUID();
  f.journal.push({
    sequence: 1,
    event: { id: crypto.randomUUID(), taskId, kind: "status", status: "running", summary: "" },
  });
  await f.value.wake();
  for (const socket of f.sockets) socket.close(1012, "Restart");
  await expect.poll(() => f.value.info("account").connected).toBe(false);
  f.journal.push({
    sequence: 2,
    event: {
      id: crypto.randomUUID(),
      taskId,
      kind: "status",
      status: "succeeded",
      summary: "Done",
    },
  });
  await expect.poll(() => f.frames.filter((frame) => frame.type === "events").length).toBe(2);
  const batches = f.frames.filter((frame) => frame.type === "events");
  expect(batches[1]?.events.map((item) => item.sequence)).toEqual([2]);
  expect(f.request.mock.calls.some(([method]) => method === "agents.detach")).toBe(false);
});

it("keeps startup available when local connection metadata is corrupt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-relay-corrupt-"));
  writeFileSync(join(directory, "remote-control.json"), "{broken");
  try {
    const value = new RemoteControl(
      directory,
      { request: async () => ({}) },
      () => {},
      () => {},
    );
    expect(value.info("account").error).toBe("SETTINGS_UNAVAILABLE");
    await expect(value.enable("account", true)).rejects.toThrow("Remote settings are unavailable");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
