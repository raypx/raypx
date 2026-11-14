import { afterEach, expect, it, vi } from "vitest";
import {
  createDeviceConnectorRegistry,
  type DeviceComputersRepository,
  type ConnectedDevice,
  type DeviceRunGrant,
} from "@raypx/computers/server";
import type {
  DeviceConnectorEventData,
  DeviceConnectorServerFrame,
} from "@raypx/contracts/device-connector";
import { createDeviceBroker } from "../../src/runtime/device-broker.js";

const url = process.env.TEST_REDIS_URL;
if (!url) throw new Error("TEST_REDIS_URL is required");
const registries: ReturnType<typeof createDeviceConnectorRegistry>[] = [];
afterEach(async () => {
  await Promise.all(registries.splice(0).map((registry) => registry.shutdown()));
});
function unused(): never {
  throw new Error("Unexpected repository call");
}
it("routes a fenced device command and revocation through the real private Redis broker", async () => {
  const ownerBroker = createDeviceBroker(url);
  const requesterBroker = createDeviceBroker(url);
  const deviceId = crypto.randomUUID();
  const grant: DeviceRunGrant = {
    id: crypto.randomUUID(),
    spaceId: "space",
    deviceId,
    directory: "/native/confirmed",
    revision: 3,
    name: "Fixture machine",
    generation: 1,
    connectionFence: 2,
    connectionOwner: ownerBroker.nodeId,
  };
  const credential = {
    protocolVersion: 1 as const,
    deviceId,
    deviceName: "Fixture machine",
    accountId: "member",
    credential: "c".repeat(64),
    credentialRevision: 4,
  };
  const device: ConnectedDevice = {
    deviceId,
    accountId: "member",
    credentialRevision: 4,
    connectionFence: 2,
    cursor: 0,
    grants: [grant],
    credential,
  };
  const events: { sequence: number; event: DeviceConnectorEventData }[] = [];
  const repository: DeviceComputersRepository = {
    list: unused,
    createPairing: unused,
    claim: unused,
    confirm: unused,
    prepareGrant: unused,
    revokeAccount: unused,
    authenticate: vi.fn(async () => device),
    connect: vi.fn(async () => device),
    ready: vi.fn(async () => {}),
    heartbeat: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    route: vi.fn(async () => ({ owner: ownerBroker.nodeId, fence: 2 })),
    grants: vi.fn(async () => [grant]),
    grant: unused,
    revokeGrant: unused,
    revoke: vi.fn(async () => {}),
    owned: unused,
    getSelection: unused,
    select: unused,
    resolveRun: unused,
    admit: vi.fn(async () => grant),
    beginOperation: vi.fn(async () => {}),
    operationEvents: vi.fn(async (_context, _id, after) =>
      events.filter((event) => event.sequence > after),
    ),
    event: vi.fn(async (_device, sequence, _operationId, event) => {
      events.push({ sequence, event });
      return true;
    }),
  };
  const owner = createDeviceConnectorRegistry(repository, ownerBroker);
  const requester = createDeviceConnectorRegistry(repository, requesterBroker);
  registries.push(owner, requester);
  expect(ownerBroker.ready()).toBe(false);
  await Promise.all([owner.start(), requester.start()]);
  const frames: DeviceConnectorServerFrame[] = [];
  const peer = {
    send: vi.fn((frame: DeviceConnectorServerFrame) => {
      frames.push(frame);
    }),
    close: vi.fn(),
  };
  await owner.open("peer", credential.credential, peer);
  await owner.receive(
    "peer",
    JSON.stringify({ type: "hello", protocolVersion: 1, deviceId, cursor: 0 }),
  );
  await owner.receive(
    "peer",
    JSON.stringify({ type: "ready", connectionFence: 2, credentialRevision: 4 }),
  );
  const operationId = crypto.randomUUID();
  const context = {
    spaceId: "space",
    conversationId: "conversation",
    runId: "run",
    runFence: 7,
    requesterAccountId: "member",
    deviceId,
    grantId: grant.id,
  };
  const stream = await requester.request(
    context,
    operationId,
    {
      kind: "execute",
      executable: "echo",
      argv: ["bounded"],
      cwd: ".",
      environment: {},
      outputBudget: 32,
      approved: true,
    },
    new AbortController().signal,
  );
  const request = frames.find((frame) => frame.type === "request");
  expect(request).toMatchObject({
    type: "request",
    request: {
      operationId,
      grantRevision: 3,
      runFence: 7,
      connectionFence: 2,
      requesterAccountId: "member",
    },
  });
  expect(JSON.stringify(request)).not.toContain(credential.credential);
  await owner.receive(
    "peer",
    JSON.stringify({
      type: "event",
      connectionFence: 2,
      sequence: 1,
      operationId,
      event: { kind: "accepted" },
    }),
  );
  await owner.receive(
    "peer",
    JSON.stringify({
      type: "event",
      connectionFence: 2,
      sequence: 2,
      operationId,
      event: { kind: "stdout", bytes: Buffer.from("bounded").toString("base64") },
    }),
  );
  await owner.receive(
    "peer",
    JSON.stringify({
      type: "event",
      connectionFence: 2,
      sequence: 3,
      operationId,
      event: { kind: "exit", status: 0, cancelled: false, truncated: false },
    }),
  );
  const received = [];
  for await (const event of stream) received.push(event);
  expect(received.map((event) => event.kind)).toEqual(["accepted", "stdout", "exit"]);
  expect(repository.beginOperation).toHaveBeenCalledOnce();
  await requester.revoke(device);
  expect(repository.revoke).toHaveBeenCalledOnce();
  expect(frames.at(-1)).toEqual({ type: "revoked", reason: "DEVICE_REVOKED" });
  expect(peer.close).toHaveBeenCalledWith(4003, "Device revoked");
}, 15_000);
