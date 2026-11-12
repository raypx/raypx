import { expect, it, vi } from "vitest";
import { RelayHub } from "@raypx/control/relay";
import { ControlService } from "@raypx/control";
import { connected, memoryControlRepository } from "../tests/helpers/control.js";
import { RELAY_VERSION } from "@raypx/contracts/tasks";

it.each([undefined, 1, 2, 3, RELAY_VERSION - 1, String(RELAY_VERSION), RELAY_VERSION + 1])(
  "rejects unsupported relay version %s with a terminal upgrade code",
  async (protocolVersion) => {
    const service = new ControlService(memoryControlRepository()),
      hub = new RelayHub(async (run) => run(service)),
      id = crypto.randomUUID(),
      send = vi.fn(),
      close = vi.fn();
    hub.open({ id, send, close });
    await hub.receive(
      id,
      JSON.stringify({ type: "auth", protocolVersion, role: "viewer", token: "synthetic-token" }),
    );
    expect(send).toHaveBeenCalledWith({ type: "error", code: "UPGRADE_REQUIRED" });
    expect(close).toHaveBeenCalledWith(4006, "UPGRADE_REQUIRED");
    await hub.shutdown();
  },
);

it("drains in-flight device frames before disconnecting on shutdown", async () => {
  const control = new ControlService(memoryControlRepository()),
    f = await connected(control),
    id = crypto.randomUUID(),
    actor = await control.credentials.authenticate("device", f.grant.token, id);
  let blocked = false,
    release!: () => void,
    entered!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    started = new Promise<void>((resolve) => (entered = resolve));
  const hub = new RelayHub(async (run) => {
    if (blocked) {
      entered();
      await gate;
    }
    return run(control);
  });
  hub.open({ id, send() {}, close() {} });
  await hub.receive(
    id,
    JSON.stringify({ type: "auth", protocolVersion: 5, role: "device", token: f.grant.token }),
  );
  blocked = true;
  const announce = hub.receive(id, JSON.stringify(f.announce));
  await started;
  const stopped = hub.shutdown();
  release();
  await Promise.all([announce, stopped]);
  await expect(control.tasks.events(actor, f.announce.streamId, [])).rejects.toMatchObject({
    code: "DEVICE_REPLACED",
  });
});

it("classifies repository failures as retryable server errors, never invalid client frames", async () => {
  const hub = new RelayHub(async () => {
    throw new Error("private database failure");
  });
  const id = crypto.randomUUID(),
    send = vi.fn(),
    close = vi.fn();
  hub.open({ id, send, close });
  await hub.receive(
    id,
    JSON.stringify({ type: "auth", protocolVersion: 5, role: "viewer", token: "x".repeat(72) }),
  );
  expect(send).toHaveBeenCalledWith({ type: "error", code: "SERVER_UNAVAILABLE" });
  expect(close).toHaveBeenCalledWith(1011, "SERVER_UNAVAILABLE");
  expect(JSON.stringify(send.mock.calls)).not.toContain("private");
  await hub.shutdown();
});
