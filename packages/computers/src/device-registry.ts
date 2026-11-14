import {
  DEVICE_CONNECTOR_MAX_FRAME_BYTES,
  DEVICE_CONNECTOR_VERSION,
  deviceConnectorClientFrameSchema,
  deviceConnectorPayloadIdentity,
  type DeviceConnectorServerFrame,
  type DeviceConnectorRequest,
  type DeviceConnectorEventData,
} from "@raypx/contracts/device-connector";
export interface DeviceConnectorBroker {
  readonly nodeId: string;
  ready(): boolean;
  start(
    handle: (deviceId: string, frame: DeviceConnectorServerFrame) => Promise<void>,
    unavailable: () => void,
  ): Promise<void>;
  invoke(
    owner: string,
    deviceId: string,
    frame: DeviceConnectorServerFrame,
    signal: AbortSignal,
  ): Promise<void>;
  close(): Promise<void>;
}
import type { SpaceScope } from "@raypx/spaces/server";
import {
  DeviceComputerError,
  type ConnectedDevice,
  type ConnectorIdentity,
  type DeviceComputersRepository,
  type DeviceComputersService,
  type DeviceRunContext,
} from "./devices.js";

export interface DeviceConnectorPeer {
  send(frame: DeviceConnectorServerFrame): void;
  close(code: number, reason: string): void;
}
interface Peer {
  peer: DeviceConnectorPeer;
  identity: ConnectorIdentity;
  device?: ConnectedDevice;
  ready: boolean;
  lastPong: number;
  receiving: Promise<void>;
  timer?: ReturnType<typeof setInterval>;
}
function pause(signal: AbortSignal, milliseconds = 25) {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
  });
}
export function createDeviceConnectorRegistry(
  repository: DeviceComputersRepository,
  cluster?: DeviceConnectorBroker,
) {
  const owner = cluster?.nodeId ?? crypto.randomUUID();
  const peers = new Map<string, Peer>();
  let closing = false;
  function local(deviceId: string, frame: DeviceConnectorServerFrame) {
    const client = [...peers.values()].find(
      (entry) => entry.ready && entry.device?.deviceId === deviceId,
    );
    if (!client) throw new DeviceComputerError("DEVICE_OFFLINE");
    if (
      frame.type === "request" &&
      (client.device!.connectionFence !== frame.request.connectionFence ||
        client.device!.accountId !== frame.request.accountId ||
        frame.request.requesterAccountId !== frame.request.accountId)
    )
      throw new DeviceComputerError("STALE_FENCE");
    client.peer.send(frame);
    if (frame.type === "revoked") {
      client.ready = false;
      client.peer.close(4003, "Device revoked");
    }
  }
  async function send(
    identity: ConnectorIdentity,
    frame: DeviceConnectorServerFrame,
    route?: { owner: string; fence: number },
  ) {
    const target = route ?? (await repository.route(identity));
    if (!target.owner) throw new DeviceComputerError("DEVICE_OFFLINE");
    if (target.owner === owner) {
      local(identity.deviceId, frame);
      return;
    }
    if (!cluster?.ready()) throw new DeviceComputerError("DEVICE_OFFLINE");
    const signal = AbortSignal.timeout(5000);
    await cluster.invoke(target.owner, identity.deviceId, frame, signal);
  }
  async function close(peerId: string) {
    const client = peers.get(peerId);
    if (!client) return;
    peers.delete(peerId);
    clearInterval(client.timer);
    if (client.device) await repository.disconnect(client.device, owner);
  }
  async function receive(client: Peer, raw: string) {
    if (Buffer.byteLength(raw) > DEVICE_CONNECTOR_MAX_FRAME_BYTES)
      throw new DeviceComputerError("LIMIT_EXCEEDED");
    const parsed = deviceConnectorClientFrameSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new DeviceComputerError("INVALID_INPUT");
    const frame = parsed.data;
    if (frame.type === "hello") {
      if (client.device || frame.deviceId !== client.identity.deviceId)
        throw new DeviceComputerError("ACCESS_DENIED");
      const device = await repository.connect(client.identity, owner);
      client.device = device;
      for (const other of peers.values())
        if (other !== client && other.device?.deviceId === device.deviceId) {
          other.ready = false;
          other.peer.close(4002, "Device reconnected");
        }
      client.peer.send({
        type: "welcome",
        protocolVersion: DEVICE_CONNECTOR_VERSION,
        connectionFence: device.connectionFence,
        cursor: device.cursor,
        credential: device.credential,
        grants: device.grants,
      });
      client.timer = setInterval(() => {
        if (Date.now() - client.lastPong > 15_000) {
          client.peer.close(4000, "Device timeout");
          return;
        }
        void repository
          .heartbeat(device, owner)
          .then(async () => {
            const current = await repository.grants(device);
            client.peer.send({
              type: "grants",
              connectionFence: device.connectionFence,
              grants: current,
            });
            client.peer.send({ type: "ping" });
          })
          .catch(() => client.peer.close(4003, "Access revoked"));
      }, 4000);
      return;
    }
    const device = client.device;
    if (!device) throw new DeviceComputerError("ACCESS_DENIED");
    if (frame.type === "ready") {
      if (
        frame.connectionFence !== device.connectionFence ||
        frame.credentialRevision !== device.credentialRevision
      )
        throw new DeviceComputerError("STALE_FENCE");
      await repository.ready(device, owner);
      client.ready = true;
      return;
    }
    if (frame.type === "pong") {
      client.lastPong = Date.now();
      return;
    }
    if (!client.ready) throw new DeviceComputerError("ACCESS_DENIED");
    if (frame.type === "grant") return;
    if (frame.connectionFence !== device.connectionFence)
      throw new DeviceComputerError("STALE_FENCE");
    await repository.event(device, frame.sequence, frame.operationId, frame.event);
    client.peer.send({
      type: "ack",
      connectionFence: device.connectionFence,
      sequence: frame.sequence,
    });
  }
  return {
    repository,
    owner,
    ready: () => !closing && (!cluster || cluster.ready()),
    async start() {
      if (!cluster) return;
      await cluster.start(
        async (deviceId, frame) => {
          local(deviceId, frame);
        },
        () => {
          for (const client of peers.values()) {
            client.ready = false;
            client.peer.close(4000, "Broker unavailable");
          }
        },
      );
    },
    async open(peerId: string, credential: string, peer: DeviceConnectorPeer) {
      if (cluster && !cluster.ready()) throw new DeviceComputerError("DEVICE_OFFLINE");
      if (closing || peers.size >= 256) throw new DeviceComputerError("LIMIT_EXCEEDED");
      const identity = await repository.authenticate(credential);
      peers.set(peerId, {
        identity,
        peer,
        ready: false,
        lastPong: Date.now(),
        receiving: Promise.resolve(),
      });
    },
    receive(peerId: string, raw: string) {
      const client = peers.get(peerId);
      if (!client) return;
      client.receiving = client.receiving
        .then(() => receive(client, raw))
        .catch(() => {
          client.ready = false;
          client.peer.close(4000, "Invalid connector state");
        });
      return client.receiving;
    },
    close,
    async refresh(identity: ConnectorIdentity) {
      const route = await repository.route(identity);
      await send(
        identity,
        { type: "grants", connectionFence: route.fence, grants: await repository.grants(identity) },
        route,
      ).catch(() => {});
    },
    async revoke(identity: ConnectorIdentity) {
      const route = await repository.route(identity);
      await repository.revoke(identity);
      await send(identity, { type: "revoked", reason: "DEVICE_REVOKED" }, route).catch(() => {});
    },
    async requestGrant(scope: SpaceScope, deviceId: string) {
      const identity = await repository.owned(scope, deviceId);
      const requestId = crypto.randomUUID();
      await send(identity, {
        type: "request-grant",
        requestId,
        spaceId: scope.spaceId,
        spaceLabel: identity.spaceLabel,
      });
      return { requestId };
    },
    async request(
      context: DeviceRunContext,
      operationId: string,
      operation: DeviceConnectorRequest["operation"],
      signal: AbortSignal,
    ): Promise<AsyncIterable<DeviceConnectorEventData>> {
      const grant = await repository.admit(context);
      const request: DeviceConnectorRequest = {
        operationId,
        payloadHash: "0".repeat(64),
        deviceId: context.deviceId,
        accountId: context.requesterAccountId,
        requesterAccountId: context.requesterAccountId,
        spaceId: context.spaceId,
        grantId: context.grantId,
        grantRevision: grant.revision,
        connectionFence: grant.connectionFence,
        runId: context.runId,
        runFence: context.runFence,
        expiresAt: new Date(Date.now() + 65_000).toISOString(),
        operation,
      };
      request.payloadHash = Buffer.from(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(deviceConnectorPayloadIdentity(request)),
        ),
      ).toString("hex");
      await repository.beginOperation(context, request);
      if (signal.aborted) throw new DeviceComputerError("DEVICE_OFFLINE");
      await send(
        {
          deviceId: context.deviceId,
          accountId: context.requesterAccountId,
          credentialRevision: 1,
        },
        { type: "request", request },
        { owner: grant.connectionOwner, fence: grant.connectionFence },
      );
      const cancel = () => {
        void send(
          {
            deviceId: context.deviceId,
            accountId: context.requesterAccountId,
            credentialRevision: 1,
          },
          { type: "cancel", connectionFence: grant.connectionFence, operationId },
          { owner: grant.connectionOwner, fence: grant.connectionFence },
        ).catch(() => {});
      };
      signal.addEventListener("abort", cancel, { once: true });
      return {
        async *[Symbol.asyncIterator]() {
          let after = 0;
          let terminal = false;
          try {
            while (!terminal) {
              const events = await repository.operationEvents(context, operationId, after);
              for (const item of events) {
                after = item.sequence;
                terminal = ["result", "exit", "error"].includes(item.event.kind);
                yield item.event;
              }
              if (terminal) return;
              if (signal.aborted) {
                cancel();
                throw new DeviceComputerError("OUTCOME_UNKNOWN");
              }
              if (Date.now() > Date.parse(request.expiresAt))
                throw new DeviceComputerError("OUTCOME_UNKNOWN");
              const current = await repository.admit(context);
              if (current.connectionFence !== grant.connectionFence)
                throw new DeviceComputerError("OUTCOME_UNKNOWN");
              await pause(signal);
            }
          } finally {
            signal.removeEventListener("abort", cancel);
          }
        },
      };
    },
    async shutdown() {
      closing = true;
      for (const [id, client] of peers) {
        client.peer.close(1001, "Server closing");
        await close(id);
      }
      await cluster?.close();
    },
  };
}
export type DeviceConnectorRegistry = ReturnType<typeof createDeviceConnectorRegistry>;
export function createDeviceComputersService(
  repository: DeviceComputersRepository,
  registry: DeviceConnectorRegistry,
): DeviceComputersService {
  return {
    list: async (scope) => ({ devices: await repository.list(scope) }),
    createPairing: (scope) => repository.createPairing(scope),
    requestGrant: (scope, id) => registry.requestGrant(scope, id),
    async revokeGrant(scope, id, grantId) {
      const identity = await repository.owned(scope, id);
      await repository.revokeGrant(identity, scope.spaceId, grantId);
      await registry.refresh(identity);
      return { ok: true };
    },
    async revoke(scope, id) {
      await registry.revoke(await repository.owned(scope, id));
      return { ok: true };
    },
    getSelection: async (scope, id) => ({ selection: await repository.getSelection(scope, id) }),
    select: async (scope, id, selection) => ({
      selection: await repository.select(scope, id, selection),
    }),
  };
}
