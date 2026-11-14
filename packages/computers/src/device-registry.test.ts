import { afterEach, expect, it, vi } from "vitest";
import type { DeviceConnectorServerFrame } from "@raypx/contracts/device-connector";
import { createDeviceConnectorRegistry, type DeviceConnectorBroker } from "./device-registry.js";
import {
  DeviceComputerError,
  type DeviceComputersRepository,
  type ConnectedDevice,
  type DeviceRunGrant,
} from "./devices.js";

const deviceId = "018e2c42-08e0-4000-8000-000000000001";
const grant: DeviceRunGrant = {
  id: "grant",
  spaceId: "space",
  deviceId,
  directory: "/granted",
  revision: 1,
  name: "Device",
  generation: 1,
  connectionFence: 1,
  connectionOwner: "",
};
const connected: ConnectedDevice = {
  deviceId,
  accountId: "member",
  credentialRevision: 2,
  connectionFence: 1,
  cursor: 0,
  grants: [grant],
  credential: {
    protocolVersion: 1,
    deviceId,
    deviceName: "Device",
    accountId: "member",
    credential: "a".repeat(64),
    credentialRevision: 2,
  },
};
const context = {
  spaceId: "space",
  conversationId: "conversation",
  runId: "run",
  runFence: 1,
  requesterAccountId: "member",
  deviceId,
  grantId: grant.id,
};
const operation = { kind: "write", path: "file.txt", bytes: "aGk=" } as const;
const registries: ReturnType<typeof createDeviceConnectorRegistry>[] = [];
afterEach(async () => {
  for (const registry of registries.splice(0)) await registry.shutdown();
});
function unused(): never {
  throw new Error("Unexpected repository call");
}
function fixture(cluster?: DeviceConnectorBroker) {
  const repository: DeviceComputersRepository = {
    list: unused,
    createPairing: unused,
    claim: unused,
    confirm: unused,
    prepareGrant: unused,
    revokeAccount: unused,
    authenticate: vi.fn(async () => connected),
    connect: vi.fn(async () => connected),
    ready: vi.fn(async () => {}),
    heartbeat: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    route: vi.fn(async () => ({ owner: grant.connectionOwner, fence: 1 })),
    grants: vi.fn(async () => [grant]),
    grant: unused,
    revokeGrant: unused,
    revoke: vi.fn(async () => {}),
    owned: unused,
    getSelection: unused,
    select: unused,
    resolveRun: unused,
    admit: vi.fn(async () => ({ ...grant })),
    operationEvents: vi.fn(async () => [
      { sequence: 1, event: { kind: "result" as const, value: {} } },
    ]),
    beginOperation: vi.fn(async () => {}),
    event: vi.fn(async () => true),
  };
  const registry = createDeviceConnectorRegistry(repository, cluster);
  registries.push(registry);
  grant.connectionOwner = registry.owner;
  const frames: DeviceConnectorServerFrame[] = [];
  const peer = {
    send: vi.fn((frame: DeviceConnectorServerFrame) => {
      frames.push(frame);
    }),
    close: vi.fn(),
  };
  async function pair() {
    await registry.open("peer", "credential", peer);
    await registry.receive(
      "peer",
      JSON.stringify({ type: "hello", protocolVersion: 1, deviceId, cursor: 0 }),
    );
    await registry.receive(
      "peer",
      JSON.stringify({ type: "ready", connectionFence: 1, credentialRevision: 2 }),
    );
  }
  return { repository, registry, peer, frames, pair };
}
it("ACKs only after durable event commit and refuses malformed sequence/fence admission", async () => {
  const f = fixture();
  await f.pair();
  let finish!: () => void;
  vi.mocked(f.repository.event).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(true);
      }),
  );
  const receiving = f.registry.receive(
    "peer",
    JSON.stringify({
      type: "event",
      connectionFence: 1,
      sequence: 1,
      operationId: "operation",
      event: { kind: "accepted" },
    }),
  );
  await vi.waitFor(() => expect(f.repository.event).toHaveBeenCalledOnce());
  expect(f.frames.some((frame) => frame.type === "ack")).toBe(false);
  finish();
  await receiving;
  expect(f.frames.at(-1)).toEqual({ type: "ack", connectionFence: 1, sequence: 1 });
  await f.registry.receive(
    "peer",
    JSON.stringify({
      type: "event",
      connectionFence: 2,
      sequence: 2,
      operationId: "operation",
      event: { kind: "accepted" },
    }),
  );
  expect(f.peer.close).toHaveBeenCalledWith(4000, "Invalid connector state");
  expect(f.repository.event).toHaveBeenCalledOnce();
});
it("pins every operation to the admitted grant/fences and closes immediately on revocation", async () => {
  const f = fixture();
  await f.pair();
  const stream = await f.registry.request(
    context,
    "operation",
    operation,
    new AbortController().signal,
  );
  const events = [];
  for await (const event of stream) events.push(event);
  expect(events).toEqual([{ kind: "result", value: {} }]);
  expect(f.repository.beginOperation).toHaveBeenCalledWith(
    context,
    expect.objectContaining({
      grantRevision: 1,
      connectionFence: 1,
      runFence: 1,
      requesterAccountId: "member",
      payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
  await f.registry.revoke(connected);
  expect(f.repository.revoke).toHaveBeenCalledWith(connected);
  expect(f.frames.at(-1)).toEqual({ type: "revoked", reason: "DEVICE_REVOKED" });
  expect(f.peer.close).toHaveBeenCalledWith(4003, "Device revoked");
});
it("cancels the exact operation and preserves uncertainty on abort or connection replacement", async () => {
  const f = fixture();
  await f.pair();
  vi.mocked(f.repository.operationEvents).mockResolvedValue([]);
  const signal = new AbortController();
  const stream = await f.registry.request(context, "operation", operation, signal.signal);
  signal.abort();
  await expect(async () => {
    for await (const _event of stream) unused();
  }).rejects.toThrow("OUTCOME_UNKNOWN");
  expect(f.frames).toContainEqual({ type: "cancel", connectionFence: 1, operationId: "operation" });
  const next = await f.registry.request(
    context,
    "replacement",
    operation,
    new AbortController().signal,
  );
  vi.mocked(f.repository.admit).mockResolvedValue({ ...grant, connectionFence: 2 });
  await expect(async () => {
    for await (const _event of next) unused();
  }).rejects.toThrow("OUTCOME_UNKNOWN");
});
it("routes split-role Computer frames through the existing broker without granting broader methods", async () => {
  const handlers = new Map<
    string,
    (deviceId: string, frame: DeviceConnectorServerFrame) => Promise<void>
  >();
  function broker(nodeId: string): DeviceConnectorBroker {
    return {
      nodeId,
      ready: () => true,
      start: async (handler) => {
        handlers.set(nodeId, handler);
      },
      invoke: async (target, remoteDeviceId, frame, _signal) => {
        const handler = handlers.get(target);
        if (!handler) throw new DeviceComputerError("DEVICE_OFFLINE");
        await handler(remoteDeviceId, frame);
      },
      close: async () => {
        handlers.delete(nodeId);
      },
    };
  }
  const relay = fixture(broker("relay"));
  await relay.registry.start();
  await relay.pair();
  const api = createDeviceConnectorRegistry(relay.repository, broker("api"));
  registries.push(api);
  await api.start();
  const stream = await api.request(context, "cross-role", operation, new AbortController().signal);
  for await (const _event of stream) {
    /* consume the durable terminal result */
  }
  expect(relay.frames).toContainEqual(
    expect.objectContaining({
      type: "request",
      request: expect.objectContaining({ operationId: "cross-role" }),
    }),
  );
});
