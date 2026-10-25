import {
  relayClientSchema,
  taskSchema,
  humanRequestSchema,
  MAX_RELAY_BYTES,
  type RelayClientFrame,
  type RelayServerFrame,
  type SnapshotRecord,
} from "@raypx/contracts/tasks";
import { ControlError, type ControlService, type RelayActor } from "../control/service.js";
export interface RelayPeer {
  id: string;
  send(frame: RelayServerFrame): void;
  close(code: number, reason: string): void;
}
type Client = {
  peer: RelayPeer;
  actor?: RelayActor;
  ready: boolean;
  chain: Promise<void>;
  timer: ReturnType<typeof setTimeout>;
  cursor?: { streamId: string; sequence: number };
  snapshot?: {
    id: string;
    streamId: string;
    sequence: number;
    records: SnapshotRecord[];
    bytes: number;
  };
};
type Pending = {
  viewer: string;
  device: string;
  id: string;
  method: string;
  timer: ReturnType<typeof setTimeout>;
};
export type UseControl = <T>(run: (control: ControlService) => Promise<T>) => Promise<T>;
export class RelayHub {
  private readonly peers = new Map<string, Client>();
  private readonly pending = new Map<string, Pending>();
  private readonly closing = new Map<string, Promise<void>>();
  constructor(
    private readonly use: UseControl,
    private readonly room?: string,
  ) {}
  open(peer: RelayPeer) {
    this.peers.set(peer.id, {
      peer,
      ready: false,
      chain: Promise.resolve(),
      timer: setTimeout(() => peer.close(4001, "Authentication timeout"), 5000),
    });
  }
  receive(id: string, data: string) {
    const client = this.peers.get(id);
    if (!client) return Promise.resolve();
    client.chain = client.chain
      .then(async () => {
        if (this.peers.get(id) !== client) return;
        if (new TextEncoder().encode(data).byteLength > MAX_RELAY_BYTES)
          throw new ControlError("TOO_LARGE");
        const raw: unknown = JSON.parse(data);
        if (
          raw &&
          typeof raw === "object" &&
          "type" in raw &&
          raw.type === "auth" &&
          (!("protocolVersion" in raw) || raw.protocolVersion !== 2)
        )
          throw new ControlError("UPGRADE_REQUIRED");
        const frame = relayClientSchema.parse(raw);
        await this.frame(client, frame);
      })
      .catch((error) => {
        const code = error instanceof ControlError ? error.code : "INVALID_FRAME";
        this.send(client, { type: "error", code });
        client.peer.close(
          code === "UPGRADE_REQUIRED"
            ? 4006
            : code === "DEVICE_REVOKED"
              ? 4003
              : code === "AUTH_REQUIRED"
                ? 4001
                : 4000,
          code,
        );
      });
    return client.chain;
  }
  private send(client: Client, frame: RelayServerFrame) {
    try {
      if (new TextEncoder().encode(JSON.stringify(frame)).byteLength > MAX_RELAY_BYTES)
        throw new ControlError("TOO_LARGE");
      client.peer.send(frame);
    } catch {
      client.peer.close(4000, "Backpressure");
    }
  }
  private broadcast(actor: RelayActor, frame: Extract<RelayServerFrame, { type: "changed" }>) {
    for (const client of this.peers.values())
      if (client.actor?.role === "viewer" && client.actor.userId === actor.userId)
        this.send(client, frame);
  }
  private async frame(client: Client, frame: RelayClientFrame) {
    if (!client.actor) {
      if (frame.type !== "auth") throw new ControlError("AUTH_REQUIRED");
      const actor = await this.use((control) =>
        control.authenticate(frame.role, frame.token, client.peer.id),
      );
      if (this.room && actor.userId !== this.room) throw new ControlError("FORBIDDEN");
      client.actor = actor;
      clearTimeout(client.timer);
      client.timer = setTimeout(
        () => client.peer.close(4001, "Credential expired"),
        Math.min(2_147_000_000, Math.max(1, Date.parse(actor.expiresAt) - Date.now())),
      );
      if (actor.role === "device")
        for (const other of this.peers.values())
          if (
            other !== client &&
            other.actor?.role === "device" &&
            other.actor.userId === actor.userId &&
            other.actor.deviceId === actor.deviceId
          )
            other.peer.close(4002, "Device reconnected");
      this.send(client, { type: "ready", protocolVersion: 2, role: actor.role });
      if (actor.role === "viewer")
        for (const event of await this.use((control) =>
          control.replay(actor.userId, frame.cursors ?? []),
        ))
          this.send(client, event);
      return;
    }
    const actor = client.actor;
    await this.use((control) => control.validate(actor));
    if (frame.type === "ping") {
      if (actor.role === "device" && client.ready)
        await this.use((control) => control.touch(actor));
      this.send(client, { type: "pong" });
      return;
    }
    if (actor.role === "viewer") {
      if (frame.type !== "request") throw new ControlError("FORBIDDEN");
      try {
        const command = await this.use((control) =>
          control.route(actor.userId, frame.id, frame.request),
        );
        const device = [...this.peers.values()].find(
          (peer) =>
            peer.ready &&
            peer.actor?.role === "device" &&
            peer.actor.userId === actor.userId &&
            peer.actor.deviceId === command.deviceId,
        );
        if (!device) throw new ControlError("DEVICE_OFFLINE");
        const routeId = crypto.randomUUID();
        const timer = setTimeout(() => {
          const item = this.pending.get(routeId);
          if (item) {
            this.pending.delete(routeId);
            this.send(client, {
              type: "result",
              id: item.id,
              result: { ok: false, code: "DELIVERY_EXPIRED" },
            });
          }
        }, 15_000);
        this.pending.set(routeId, {
          viewer: client.peer.id,
          device: device.peer.id,
          id: frame.id,
          method: frame.request.method,
          timer,
        });
        this.send(device, { type: "command", routeId, command });
      } catch (error) {
        this.send(client, {
          type: "result",
          id: frame.id,
          result: {
            ok: false,
            code: error instanceof ControlError ? error.code : "NETWORK_UNAVAILABLE",
          },
        });
      }
      return;
    }
    if (frame.type === "announce") {
      client.ready = false;
      const resume = await this.use((control) => control.announce(actor, frame));
      client.cursor = { streamId: resume.streamId, sequence: resume.sequence };
      this.send(client, resume);
      return;
    }
    if (frame.type === "snapshot") {
      if (!client.snapshot || client.snapshot.id !== frame.id)
        client.snapshot = {
          id: frame.id,
          streamId: frame.streamId,
          sequence: frame.sequence,
          records: [],
          bytes: 0,
        };
      const snapshot = client.snapshot;
      if (snapshot.streamId !== frame.streamId || snapshot.sequence !== frame.sequence)
        throw new ControlError("INVALID_FRAME");
      snapshot.bytes += new TextEncoder().encode(JSON.stringify(frame.records)).byteLength;
      if (snapshot.bytes > 32 * 1024 * 1024) throw new ControlError("TOO_LARGE");
      snapshot.records.push(...frame.records);
      if (frame.done) {
        await this.use((control) =>
          control.snapshot(actor, snapshot.streamId, snapshot.sequence, snapshot.records),
        );
        delete client.snapshot;
        client.cursor = { streamId: frame.streamId, sequence: frame.sequence };
        this.send(client, {
          type: "ack",
          streamId: frame.streamId,
          sequence: frame.sequence,
          snapshotId: frame.id,
        });
        this.broadcast(actor, {
          type: "changed",
          deviceId: actor.deviceId,
          streamId: frame.streamId,
          sequence: frame.sequence,
          reset: true,
        });
      }
      return;
    }
    if (frame.type === "events") {
      const sequence = await this.use((control) =>
        control.events(actor, frame.streamId, frame.events),
      );
      client.cursor = { streamId: frame.streamId, sequence };
      this.send(client, { type: "ack", streamId: frame.streamId, sequence });
      this.broadcast(actor, {
        type: "changed",
        deviceId: actor.deviceId,
        streamId: frame.streamId,
        sequence,
        events: frame.events,
      });
      return;
    }
    if (frame.type === "available") {
      if (client.ready) return;
      client.ready = true;
      await this.use((control) => control.touch(actor));
      if (client.cursor)
        this.broadcast(actor, { type: "changed", deviceId: actor.deviceId, ...client.cursor });
      return;
    }
    if (frame.type === "result") {
      const pending = this.pending.get(frame.routeId);
      if (!pending || pending.device !== client.peer.id) return;
      this.pending.delete(frame.routeId);
      clearTimeout(pending.timer);
      const viewer = this.peers.get(pending.viewer);
      if (!viewer?.actor) return;
      await this.use((control) => control.validate(viewer.actor!));
      const result = frame.result.ok
        ? {
            ok: true as const,
            value:
              pending.method === "approvals.decide"
                ? humanRequestSchema.parse(frame.result.value)
                : taskSchema.parse(frame.result.value),
          }
        : frame.result;
      this.send(viewer, { type: "result", id: pending.id, result });
      return;
    }
    throw new ControlError("FORBIDDEN");
  }
  close(id: string): Promise<void> {
    const closing = this.closing.get(id);
    if (closing) return closing;
    const client = this.peers.get(id);
    if (!client) return Promise.resolve();
    this.peers.delete(id);
    clearTimeout(client.timer);
    for (const [route, item] of this.pending)
      if (item.viewer === id || item.device === id) {
        clearTimeout(item.timer);
        this.pending.delete(route);
        const viewer = this.peers.get(item.viewer);
        if (viewer)
          this.send(viewer, {
            type: "result",
            id: item.id,
            result: { ok: false, code: "DEVICE_OFFLINE" },
          });
      }
    const cleanup = (async () => {
      await client.chain;
      clearTimeout(client.timer);
      if (client.actor?.role === "device") {
        await this.use((control) => control.disconnect(client.actor!));
        if (client.cursor)
          this.broadcast(client.actor, {
            type: "changed",
            deviceId: client.actor.deviceId,
            ...client.cursor,
          });
      }
    })().finally(() => this.closing.delete(id));
    this.closing.set(id, cleanup);
    return cleanup;
  }
  async revoke(userId: string, deviceId: string) {
    for (const client of this.peers.values())
      if (client.actor?.userId === userId && client.actor.deviceId === deviceId)
        client.peer.close(4003, "Device revoked");
  }
  async shutdown() {
    const clients = [...this.peers.values()];
    for (const client of clients) client.peer.close(1001, "Server stopping");
    for (const item of this.pending.values()) clearTimeout(item.timer);
    for (const client of this.peers.values()) clearTimeout(client.timer);
    this.pending.clear();
    await Promise.allSettled(clients.map((client) => this.close(client.peer.id)));
    await Promise.allSettled(this.closing.values());
  }
}
