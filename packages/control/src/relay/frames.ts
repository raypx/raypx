import { JobError } from "@raypx/jobs";
import type { RelayClientFrame } from "@raypx/contracts/tasks";
import { terminalRequestSchema } from "@raypx/contracts/terminal";
import { taskSchema, humanRequestSchema } from "@raypx/core/tasks";
import { ControlError, type RelayActor } from "../service.ts";
import type { Client, DeviceResult, RelayRegistry } from "./registry.ts";
type FrameType = RelayClientFrame["type"];
type Frame<T extends FrameType> = Extract<RelayClientFrame, { type: T }>;
interface FrameContext {
  relay: RelayRegistry;
  client: Client;
  actor: RelayActor;
}
export type FrameHandler<T extends FrameType = FrameType> = (
  context: FrameContext,
  frame: Frame<T>,
) => Promise<void>;
function viewerResult(method: string, result: DeviceResult): DeviceResult {
  return result.ok
    ? {
        ok: true,
        value:
          method === "observed.decide"
            ? terminalRequestSchema.parse(result.value)
            : method === "approvals.decide"
              ? humanRequestSchema.parse(result.value)
              : taskSchema.parse(result.value),
      }
    : result;
}
/** Bind the socket to its credential; a device socket fences older sockets of that device. */
export async function authenticate(relay: RelayRegistry, client: Client, frame: Frame<"auth">) {
  const actor = await relay.use((control) =>
    control.credentials.authenticate(frame.role, frame.token, relay.connectionId(client.peer.id)),
  );
  if (!relay.inRoom(actor.userId)) throw new ControlError("FORBIDDEN");
  client.actor = actor;
  clearTimeout(client.timer);
  client.timer = setTimeout(
    () => client.peer.close(4001, "Credential expired"),
    Math.min(2_147_000_000, Math.max(1, Date.parse(actor.expiresAt) - Date.now())),
  );
  if (actor.role === "device")
    for (const other of relay.peers.values())
      if (
        other !== client &&
        other.actor?.role === "device" &&
        other.actor.userId === actor.userId &&
        other.actor.deviceId === actor.deviceId
      ) {
        other.ready = false;
        other.peer.close(4002, "Device reconnected");
      }
  relay.send(client, {
    type: "ready",
    protocolVersion: frame.protocolVersion,
    role: actor.role,
  });
  if (actor.role === "viewer")
    for (const event of await relay.use((control) =>
      control.tasks.replay(actor.userId, frame.cursors ?? []),
    ))
      relay.send(client, event);
}
const ping: FrameHandler<"ping"> = async ({ relay, client, actor }) => {
  if (actor.role === "device" && client.ready)
    await relay.use((control) => control.tasks.touch(actor));
  relay.send(client, { type: "pong" });
};
/** Viewer commands go to the owning node, or to a local device route awaiting its result. */
const request: FrameHandler<"request"> = async ({ relay, client, actor }, frame) => {
  try {
    const command = await relay.use((control) =>
      control.commands.route(actor.userId, frame.id, frame.request),
    );
    if (command.recoveredTask) {
      relay.send(client, {
        type: "result",
        id: frame.id,
        result: { ok: true, value: command.recoveredTask },
      });
      return;
    }
    const connection = await relay.remote(actor.userId, command.deviceId);
    const owner = relay.cluster && connection.id.split(":")[0];
    if (relay.cluster && owner !== relay.cluster.nodeId) {
      const reply = await relay.cluster.invoke(
        owner!,
        {
          type: "command",
          connectionId: connection.id,
          viewer: { ...actor, role: "viewer" },
          command,
        },
        client.abort.signal,
      );
      if (reply.type !== "command") throw new JobError("INVALID_DEVICE_RESULT", true);
      await relay.use((control) => control.credentials.validate(actor));
      if (relay.peers.get(client.peer.id) === client)
        relay.send(client, {
          type: "result",
          id: frame.id,
          result: viewerResult(frame.request.method, reply.result),
        });
      return;
    }
    const device = await relay.localConnection(actor.userId, command.deviceId, connection.id);
    if (relay.pending.size >= 1024) throw new ControlError("TOO_MANY_REQUESTS");
    const routeId = crypto.randomUUID();
    const timer = setTimeout(() => {
      const item = relay.pending.get(routeId);
      if (item?.kind === "viewer") {
        relay.pending.delete(routeId);
        relay.send(client, {
          type: "result",
          id: item.id,
          result: { ok: false, code: "DELIVERY_EXPIRED" },
        });
      }
    }, 15_000);
    relay.pending.set(routeId, {
      kind: "viewer",
      viewer: client.peer.id,
      device: device.peer.id,
      id: frame.id,
      method: frame.request.method,
      timer,
    });
    relay.send(device, { type: "command", routeId, command });
  } catch (error) {
    relay.send(client, {
      type: "result",
      id: frame.id,
      result: {
        ok: false,
        code:
          error instanceof ControlError || error instanceof JobError
            ? error.code
            : "NETWORK_UNAVAILABLE",
      },
    });
  }
};
const observed: FrameHandler<"observed"> = async ({ relay, client, actor }, frame) => {
  if (!client.ready) throw new ControlError("FORBIDDEN");
  await relay.use((control) => control.observed.observed(actor, frame));
  relay.send(client, { type: "observed_ack", epoch: frame.epoch, revision: frame.revision });
  await relay.broadcast(actor, { type: "observed_changed", deviceId: actor.deviceId });
};
/** The device stays unavailable for commands until it reports `available` after resuming. */
const announce: FrameHandler<"announce"> = async ({ relay, client, actor }, frame) => {
  client.ready = false;
  const resume = await relay.use((control) => control.tasks.announce(actor, frame));
  await relay.cluster?.notify({
    type: "connected",
    userId: actor.userId,
    deviceId: actor.deviceId,
    connectionId: actor.connectionId,
  });
  client.cursor = { streamId: resume.streamId, sequence: resume.sequence };
  relay.send(client, resume);
};
/** Chunks accumulate per snapshot id and commit once; a correlated sync resolves after commit. */
const snapshot: FrameHandler<"snapshot"> = async ({ relay, client, actor }, frame) => {
  if (!client.snapshot || client.snapshot.id !== frame.id)
    client.snapshot = {
      id: frame.id,
      streamId: frame.streamId,
      sequence: frame.sequence,
      records: [],
      bytes: 0,
      ...(frame.syncId ? { syncId: frame.syncId } : {}),
    };
  const current = client.snapshot;
  if (
    current.streamId !== frame.streamId ||
    current.sequence !== frame.sequence ||
    current.syncId !== frame.syncId
  )
    throw new ControlError("INVALID_FRAME");
  current.bytes += new TextEncoder().encode(JSON.stringify(frame.records)).byteLength;
  if (current.bytes > 32 * 1024 * 1024) throw new ControlError("TOO_LARGE");
  current.records.push(...frame.records);
  if (!frame.done) return;
  await relay.use((control) =>
    control.tasks.snapshot(actor, current.streamId, current.sequence, current.records),
  );
  delete client.snapshot;
  client.cursor = { streamId: frame.streamId, sequence: frame.sequence };
  relay.send(client, {
    type: "ack",
    streamId: frame.streamId,
    sequence: frame.sequence,
    snapshotId: frame.id,
  });
  await relay.broadcast(actor, {
    type: "changed",
    deviceId: actor.deviceId,
    streamId: frame.streamId,
    sequence: frame.sequence,
    reset: true,
  });
  if (frame.syncId) {
    const sync = relay.syncs.get(`${actor.userId}:${frame.syncId}`);
    if (sync?.device === client.peer.id && sync.epoch === actor.epoch)
      sync.complete({ type: "synced", streamId: frame.streamId, sequence: frame.sequence });
  }
};
const events: FrameHandler<"events"> = async ({ relay, client, actor }, frame) => {
  const sequence = await relay.use((control) =>
    control.tasks.events(actor, frame.streamId, frame.events),
  );
  client.cursor = { streamId: frame.streamId, sequence };
  relay.send(client, { type: "ack", streamId: frame.streamId, sequence });
  await relay.broadcast(actor, {
    type: "changed",
    deviceId: actor.deviceId,
    streamId: frame.streamId,
    sequence,
    events: frame.events,
  });
};
const available: FrameHandler<"available"> = async ({ relay, client, actor }) => {
  if (client.ready) return;
  client.ready = true;
  await relay.use((control) => control.tasks.touch(actor));
  if (client.cursor)
    await relay.broadcast(actor, { type: "changed", deviceId: actor.deviceId, ...client.cursor });
};
/** Only the device a route was sent to can settle it; viewer results are revalidated first. */
const result: FrameHandler<"result"> = async ({ relay, client }, frame) => {
  const pending = relay.pending.get(frame.routeId);
  if (!pending || pending.device !== client.peer.id) return;
  relay.pending.delete(frame.routeId);
  clearTimeout(pending.timer);
  if (pending.kind === "job") {
    pending.complete(frame.result);
    return;
  }
  const viewer = relay.peers.get(pending.viewer);
  if (!viewer?.actor) return;
  await relay.use((control) => control.credentials.validate(viewer.actor!));
  relay.send(viewer, {
    type: "result",
    id: pending.id,
    result: viewerResult(pending.method, frame.result),
  });
};
/** Frames each authenticated role may send; every other frame is forbidden for that role. */
export const frameHandlers: Record<RelayActor["role"], { [T in FrameType]?: FrameHandler<T> }> = {
  viewer: { ping, request },
  device: { ping, observed, announce, snapshot, events, available, result },
};
