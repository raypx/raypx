import { JobError, type CloudJobRun } from "@raypx/jobs";
import {
  relayClientSchema,
  RELAY_VERSION,
  MAX_RELAY_BYTES,
  type RelayClientFrame,
} from "@raypx/contracts/tasks";
import { normalizeTaskJson } from "@raypx/core/task-text";
import { ControlError } from "../service.js";
import type { RelayCluster } from "./cluster.js";
import { dispatchJob, forwarded, syncJob } from "./dispatch.js";
import { authenticate, frameHandlers, type FrameHandler } from "./frames.js";
import { RelayRegistry, type Client, type RelayPeer, type UseControl } from "./registry.js";
/** Public relay facade: socket lifecycle, frame dispatch and the internal job transport. */
export class RelayHub {
  private readonly relay: RelayRegistry;
  private readonly closing = new Map<string, Promise<void>>();
  constructor(use: UseControl, room?: string | ((userId: string) => boolean)) {
    this.relay = new RelayRegistry(use, room);
  }
  async attachCluster(cluster: RelayCluster) {
    this.relay.cluster = cluster;
    await cluster.start(
      (operation, signal) => forwarded(this.relay, operation, signal),
      (notice) => this.relay.notice(notice),
      () => {
        for (const client of this.relay.peers.values()) {
          client.ready = false;
          client.peer.close(1013, "Relay unavailable");
          void this.close(client.peer.id).catch(() => {});
        }
      },
    );
  }
  ready() {
    return this.relay.ready();
  }
  open(peer: RelayPeer) {
    if (!this.ready()) {
      peer.close(1013, "Relay unavailable");
      return;
    }
    this.relay.peers.set(peer.id, {
      peer,
      ready: false,
      chain: Promise.resolve(),
      timer: setTimeout(() => peer.close(4001, "Authentication timeout"), 5000),
      abort: new AbortController(),
    });
  }
  receive(id: string, data: string) {
    const client = this.relay.peers.get(id);
    if (!client) return Promise.resolve();
    client.chain = client.chain
      .then(async () => {
        if (this.relay.peers.get(id) !== client) return;
        if (new TextEncoder().encode(data).byteLength > MAX_RELAY_BYTES)
          throw new ControlError("TOO_LARGE");
        let raw: unknown;
        try {
          raw = normalizeTaskJson(JSON.parse(data));
        } catch {
          throw new ControlError("INVALID_FRAME");
        }
        if (
          raw &&
          typeof raw === "object" &&
          "type" in raw &&
          raw.type === "auth" &&
          (!("protocolVersion" in raw) || raw.protocolVersion !== RELAY_VERSION)
        )
          throw new ControlError("UPGRADE_REQUIRED");
        const parsed = relayClientSchema.safeParse(raw);
        if (!parsed.success) throw new ControlError("INVALID_FRAME");
        await this.frame(client, parsed.data);
      })
      .catch((error) => {
        const code = error instanceof ControlError ? error.code : "SERVER_UNAVAILABLE";
        this.relay.send(client, { type: "error", code });
        client.peer.close(
          code === "SERVER_UNAVAILABLE"
            ? 1011
            : code === "UPGRADE_REQUIRED"
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
  private async frame(client: Client, frame: RelayClientFrame) {
    if (!client.actor) {
      if (frame.type !== "auth") throw new ControlError("AUTH_REQUIRED");
      await authenticate(this.relay, client, frame);
      return;
    }
    const actor = client.actor;
    await this.relay.use((control) => control.credentials.validate(actor));
    // The table is keyed by frame type, so a handler always receives its own frame shape.
    const handle = frameHandlers[actor.role][frame.type] as FrameHandler | undefined;
    if (!handle) throw new ControlError("FORBIDDEN");
    await handle({ relay: this.relay, client, actor }, frame);
  }
  /** Internal scheduling port; it never creates a viewer or a browser session. */
  dispatch(userId: string, run: CloudJobRun, signal: AbortSignal, expectedConnection?: string) {
    return dispatchJob(this.relay, userId, run, signal, expectedConnection);
  }
  /** Resolve only after the correlated complete snapshot transaction commits. */
  sync(userId: string, run: CloudJobRun, signal: AbortSignal, expectedConnection?: string) {
    return syncJob(this.relay, userId, run, signal, expectedConnection);
  }
  close(id: string): Promise<void> {
    const closing = this.closing.get(id);
    if (closing) return closing;
    const { peers, pending, syncs } = this.relay;
    const client = peers.get(id);
    if (!client) return Promise.resolve();
    peers.delete(id);
    client.abort.abort();
    clearTimeout(client.timer);
    for (const [route, item] of pending)
      if ((item.kind === "viewer" && item.viewer === id) || item.device === id) {
        clearTimeout(item.timer);
        pending.delete(route);
        if (item.kind === "job") {
          item.complete({ ok: false, code: "DEVICE_OFFLINE" }, true);
          continue;
        }
        const viewer = peers.get(item.viewer);
        if (viewer)
          this.relay.send(viewer, {
            type: "result",
            id: item.id,
            result: { ok: false, code: "DEVICE_OFFLINE" },
          });
      }
    for (const item of syncs.values())
      if (item.device === id) item.complete(new JobError("DEVICE_OFFLINE", true));
    const cleanup = (async () => {
      await client.chain;
      clearTimeout(client.timer);
      if (client.actor?.role === "device") {
        await this.relay.use((control) => control.tasks.disconnect(client.actor!));
        if (client.cursor)
          await this.relay.broadcast(client.actor, {
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
    this.relay.revokeLocal(userId, deviceId);
    await this.relay.cluster?.notify({ type: "revoke", userId, deviceId });
  }
  async shutdown() {
    this.relay.stopping = true;
    await this.relay.cluster?.close();
    const { peers, pending, syncs } = this.relay;
    const clients = [...peers.values()];
    for (const client of clients) client.peer.close(1001, "Server stopping");
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      if (item.kind === "job") item.complete({ ok: false, code: "SERVER_UNAVAILABLE" }, true);
    }
    for (const item of syncs.values()) item.complete(new JobError("SERVER_UNAVAILABLE", true));
    for (const client of peers.values()) clearTimeout(client.timer);
    pending.clear();
    await Promise.allSettled(clients.map((client) => this.close(client.peer.id)));
    await Promise.allSettled(this.closing.values());
  }
}
