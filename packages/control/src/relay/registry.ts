import { JobError } from "@raypx/core/jobs";
import type { JobDispatchResult } from "@raypx/jobs/server";
import {
  MAX_RELAY_BYTES,
  type RelayClientFrame,
  type RelayServerFrame,
  type SnapshotRecord,
} from "@raypx/contracts/tasks";
import { ControlError, type ControlService, type RelayActor } from "../service.js";
import type { RelayCluster, RelayNotice } from "./cluster.js";
export interface RelayPeer {
  id: string;
  send(frame: RelayServerFrame): void;
  close(code: number, reason: string): void;
}
export type Client = {
  peer: RelayPeer;
  actor?: RelayActor;
  ready: boolean;
  chain: Promise<void>;
  delivery: Promise<void>;
  timer: ReturnType<typeof setTimeout>;
  abort: AbortController;
  cursor?: { streamId: string; sequence: number };
  snapshot?: {
    id: string;
    streamId: string;
    sequence: number;
    records: SnapshotRecord[];
    bytes: number;
    syncId?: string;
  };
};
export type DeviceResult = Extract<RelayClientFrame, { type: "result" }>["result"];
type Pending = {
  device: string;
  id: string;
  method: string;
  timer: ReturnType<typeof setTimeout>;
} & (
  | { kind: "viewer"; viewer: string }
  | { kind: "job"; complete(result: DeviceResult, uncertain?: boolean): void }
);
export type Synced = Extract<JobDispatchResult, { type: "synced" }>;
export type SyncPending = {
  device: string;
  epoch: number;
  promise: Promise<Synced>;
  complete(value: Synced | JobError): void;
};
export type UseControl = <T>(run: (control: ControlService) => Promise<T>) => Promise<T>;
/** Local sockets, correlated routes and room rules shared by frame handling and job dispatch. */
export class RelayRegistry {
  readonly peers = new Map<string, Client>();
  readonly pending = new Map<string, Pending>();
  readonly syncs = new Map<string, SyncPending>();
  cluster?: RelayCluster;
  stopping = false;
  constructor(
    readonly use: UseControl,
    private readonly room?: string | ((userId: string) => boolean),
  ) {}
  ready() {
    return !this.stopping && (!this.cluster || this.cluster.ready());
  }
  connectionId(id: string) {
    return this.cluster ? `${this.cluster.nodeId}:${id}` : id;
  }
  inRoom(userId: string) {
    return !this.room || (typeof this.room === "string" ? this.room === userId : this.room(userId));
  }
  async remote(userId: string, deviceId: string) {
    if (!this.ready()) throw new JobError("SERVER_UNAVAILABLE");
    const connection = await this.use((control) => control.tasks.connection(userId, deviceId));
    if (!connection?.ready) throw new JobError("DEVICE_OFFLINE");
    return connection;
  }
  async localConnection(userId: string, deviceId: string, connectionId: string) {
    if (!this.inRoom(userId)) throw new JobError("FORBIDDEN");
    if (!this.ready()) throw new JobError("SERVER_UNAVAILABLE");
    const client = [...this.peers.values()].find(
      (peer) =>
        peer.ready &&
        peer.actor?.role === "device" &&
        peer.actor.userId === userId &&
        peer.actor.deviceId === deviceId &&
        peer.actor.connectionId === connectionId,
    );
    if (!client?.actor) throw new JobError("DEVICE_OFFLINE");
    await this.use((control) => control.credentials.validate(client.actor!));
    const current = await this.remote(userId, deviceId);
    if (current.id !== connectionId) throw new JobError("DEVICE_REPLACED");
    if (this.peers.get(client.peer.id) !== client || !client.ready)
      throw new JobError("DEVICE_OFFLINE");
    return client;
  }
  send(client: Client, frame: RelayServerFrame) {
    try {
      if (new TextEncoder().encode(JSON.stringify(frame)).byteLength > MAX_RELAY_BYTES)
        throw new ControlError("TOO_LARGE");
      client.peer.send(frame);
    } catch {
      client.peer.close(4000, "Backpressure");
    }
  }
  private async broadcastLocal(userId: string, frame: RelayServerFrame) {
    await Promise.all(
      [...this.peers.values()].map(async (client) => {
        const actor = client.actor;
        if (actor?.role !== "viewer" || actor.userId !== userId) return;
        // Broker notices may arrive concurrently. Keep each viewer's event order
        // without waiting for its inbound requests or another viewer's lookup.
        client.delivery = client.delivery.then(async () => {
          const current = () =>
            this.ready() &&
            this.peers.get(client.peer.id) === client &&
            client.actor === actor &&
            !client.abort.signal.aborted;
          if (!current()) return;
          try {
            await this.use((control) => control.credentials.validate(actor));
          } catch (error) {
            if (!current()) return;
            // A recipient's lost session or failed lookup must not close the device
            // publishing this event or prevent delivery to other admitted viewers.
            client.abort.abort();
            clearTimeout(client.timer);
            const refused = error instanceof ControlError;
            client.peer.close(
              refused ? 4001 : 1011,
              refused ? "AUTH_REQUIRED" : "SERVER_UNAVAILABLE",
            );
            return;
          }
          if (current()) this.send(client, frame);
        });
        return client.delivery;
      }),
    );
  }
  async broadcast(
    actor: RelayActor,
    frame: Extract<RelayServerFrame, { type: "changed" | "observed_changed" }>,
  ) {
    await Promise.all([
      this.broadcastLocal(actor.userId, frame),
      this.cluster?.notify({ type: "changed", userId: actor.userId, frame }),
    ]);
  }
  async notice(notice: RelayNotice) {
    if (notice.type === "changed") {
      await this.broadcastLocal(notice.userId, notice.frame);
      return;
    }
    if (notice.type === "revoke") {
      for (const client of this.peers.values()) {
        if (client.actor?.userId !== notice.userId || client.actor.deviceId !== notice.deviceId)
          continue;
        try {
          await this.use((control) => control.credentials.validate(client.actor!));
        } catch (error) {
          if (error instanceof ControlError) client.peer.close(4003, "Device revoked");
          else throw error;
        }
      }
      return;
    }
    const current = await this.use((control) =>
      control.tasks.connection(notice.userId, notice.deviceId),
    );
    if (current?.id !== notice.connectionId) return; // Late notices cannot fence the newer owner.
    for (const client of this.peers.values())
      if (
        client.actor?.role === "device" &&
        client.actor.userId === notice.userId &&
        client.actor.deviceId === notice.deviceId &&
        client.actor.connectionId !== current.id
      ) {
        client.ready = false;
        client.peer.close(4002, "Device reconnected");
      }
  }
  revokeLocal(userId: string, deviceId: string) {
    for (const client of this.peers.values())
      if (client.actor?.userId === userId && client.actor.deviceId === deviceId)
        client.peer.close(4003, "Device revoked");
  }
}
