import { JobError, type CloudJobRun } from "@raypx/jobs";
import type { JobDispatchResult } from "@raypx/jobs/server";
import {
  relayClientSchema,
  RELAY_VERSION,
  MAX_RELAY_BYTES,
  type RelayClientFrame,
  type RelayServerFrame,
  type SnapshotRecord,
} from "@raypx/contracts/tasks";
import { normalizeTaskJson } from "@raypx/core/task-text";
import { taskSchema, humanRequestSchema } from "@raypx/core/tasks";
import { terminalRequestSchema } from "@raypx/contracts/terminal";
import { ControlError, type ControlService, type RelayActor } from "../control/service.js";
import type { RelayCluster, RelayNotice, RelayOperation, RelayReply } from "./cluster.js";
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
type DeviceResult = Extract<RelayClientFrame, { type: "result" }>["result"];
// Only these host paths reject before launching a task. Generic errors can also
// come from saving a receipt after execution, so an explicit failure is not proof.
const knownHostCreateRejections = new Set([
  "CLOSING",
  "DELIVERY_EXPIRED",
  "PROJECT_BUSY",
  "REQUEST_CLOSED",
  "CONTEXT_TOO_LARGE",
]);
type Pending = {
  device: string;
  id: string;
  method: string;
  timer: ReturnType<typeof setTimeout>;
} & (
  | { kind: "viewer"; viewer: string }
  | { kind: "job"; complete(result: DeviceResult, uncertain?: boolean): void }
);
type Synced = Extract<JobDispatchResult, { type: "synced" }>;
type SyncPending = {
  device: string;
  epoch: number;
  promise: Promise<Synced>;
  complete(value: Synced | JobError): void;
};
export type UseControl = <T>(run: (control: ControlService) => Promise<T>) => Promise<T>;
export class RelayHub {
  private readonly peers = new Map<string, Client>();
  private readonly pending = new Map<string, Pending>();
  private readonly syncs = new Map<string, SyncPending>();
  private readonly closing = new Map<string, Promise<void>>();
  private cluster?: RelayCluster;
  private stopping = false;
  constructor(
    private readonly use: UseControl,
    private readonly room?: string | ((userId: string) => boolean),
  ) {}
  async attachCluster(cluster: RelayCluster) {
    this.cluster = cluster;
    await cluster.start(
      (operation, signal) => this.forwarded(operation, signal),
      (notice) => this.notice(notice),
      () => {
        for (const client of this.peers.values()) {
          client.ready = false;
          client.peer.close(1013, "Relay unavailable");
          void this.close(client.peer.id).catch(() => {});
        }
      },
    );
  }
  ready() {
    return !this.stopping && (!this.cluster || this.cluster.ready());
  }
  private connectionId(id: string) {
    return this.cluster ? `${this.cluster.nodeId}:${id}` : id;
  }
  private async remote(userId: string, deviceId: string) {
    if (!this.ready()) throw new JobError("SERVER_UNAVAILABLE");
    const connection = await this.use((control) => control.connection(userId, deviceId));
    if (!connection?.ready) throw new JobError("DEVICE_OFFLINE");
    return connection;
  }
  private async localConnection(userId: string, deviceId: string, connectionId: string) {
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
    await this.use((control) => control.validate(client.actor!));
    const current = await this.remote(userId, deviceId);
    if (current.id !== connectionId) throw new JobError("DEVICE_REPLACED");
    if (this.peers.get(client.peer.id) !== client || !client.ready)
      throw new JobError("DEVICE_OFFLINE");
    return client;
  }
  private async forwarded(operation: RelayOperation, signal: AbortSignal): Promise<RelayReply> {
    try {
      const userId = operation.type === "command" ? operation.viewer.userId : operation.userId;
      const deviceId =
        operation.type === "command" ? operation.command.deviceId : operation.run.action.deviceId;
      const device = await this.localConnection(userId, deviceId, operation.connectionId);
      if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
      if (operation.type === "dispatch")
        return this.dispatch(userId, operation.run, signal, operation.connectionId);
      if (operation.type === "sync")
        return this.sync(userId, operation.run, signal, operation.connectionId);
      await this.use((control) => control.validate(operation.viewer));
      if (Date.parse(operation.command.expiresAt) <= Date.now())
        throw new JobError("DELIVERY_EXPIRED");
      if (this.pending.size >= 1024) throw new JobError("TOO_MANY_REQUESTS");
      return await new Promise<RelayReply>((resolve, reject) => {
        const routeId = crypto.randomUUID();
        let sent = false,
          settled = false;
        const complete = (result: DeviceResult, uncertain = false) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          this.pending.delete(routeId);
          if (uncertain) reject(new JobError(result.ok ? "SERVER_UNAVAILABLE" : result.code, sent));
          else resolve({ type: "command", result });
        };
        const abort = () => complete({ ok: false, code: "REQUEST_TIMEOUT" }, true);
        const timer = setTimeout(
          () => complete({ ok: false, code: "DELIVERY_EXPIRED" }, true),
          15_000,
        );
        this.pending.set(routeId, {
          kind: "job",
          device: device.peer.id,
          id: operation.command.id,
          method: operation.command.request.method,
          timer,
          complete,
        });
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        else {
          sent = true;
          this.send(device, { type: "command", routeId, command: operation.command });
        }
      });
    } catch (error) {
      if (error instanceof ControlError) throw new JobError(error.code);
      throw error;
    }
  }
  private async notice(notice: RelayNotice) {
    if (notice.type === "changed") {
      this.broadcastLocal(notice.userId, notice.frame);
      return;
    }
    if (notice.type === "revoke") {
      for (const client of this.peers.values()) {
        if (client.actor?.userId !== notice.userId || client.actor.deviceId !== notice.deviceId)
          continue;
        try {
          await this.use((control) => control.validate(client.actor!));
        } catch (error) {
          if (error instanceof ControlError) client.peer.close(4003, "Device revoked");
          else throw error;
        }
      }
      return;
    }
    const current = await this.use((control) => control.connection(notice.userId, notice.deviceId));
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
  private inRoom(userId: string) {
    return !this.room || (typeof this.room === "string" ? this.room === userId : this.room(userId));
  }
  open(peer: RelayPeer) {
    if (!this.ready()) {
      peer.close(1013, "Relay unavailable");
      return;
    }
    this.peers.set(peer.id, {
      peer,
      ready: false,
      chain: Promise.resolve(),
      timer: setTimeout(() => peer.close(4001, "Authentication timeout"), 5000),
      abort: new AbortController(),
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
        this.send(client, { type: "error", code });
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
  private send(client: Client, frame: RelayServerFrame) {
    try {
      if (new TextEncoder().encode(JSON.stringify(frame)).byteLength > MAX_RELAY_BYTES)
        throw new ControlError("TOO_LARGE");
      client.peer.send(frame);
    } catch {
      client.peer.close(4000, "Backpressure");
    }
  }
  private broadcastLocal(userId: string, frame: RelayServerFrame) {
    for (const client of this.peers.values())
      if (client.actor?.role === "viewer" && client.actor.userId === userId)
        this.send(client, frame);
  }
  private async broadcast(
    actor: RelayActor,
    frame: Extract<RelayServerFrame, { type: "changed" | "observed_changed" }>,
  ) {
    this.broadcastLocal(actor.userId, frame);
    await this.cluster?.notify({ type: "changed", userId: actor.userId, frame });
  }
  private result(method: string, result: DeviceResult): DeviceResult {
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
  private async frame(client: Client, frame: RelayClientFrame) {
    if (!client.actor) {
      if (frame.type !== "auth") throw new ControlError("AUTH_REQUIRED");
      const actor = await this.use((control) =>
        control.authenticate(frame.role, frame.token, this.connectionId(client.peer.id)),
      );
      if (!this.inRoom(actor.userId)) throw new ControlError("FORBIDDEN");
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
          ) {
            other.ready = false;
            other.peer.close(4002, "Device reconnected");
          }
      this.send(client, {
        type: "ready",
        protocolVersion: frame.protocolVersion,
        role: actor.role,
      });
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
        if (command.recoveredTask) {
          this.send(client, {
            type: "result",
            id: frame.id,
            result: { ok: true, value: command.recoveredTask },
          });
          return;
        }
        const connection = await this.remote(actor.userId, command.deviceId);
        const owner = this.cluster && connection.id.split(":")[0];
        if (this.cluster && owner !== this.cluster.nodeId) {
          const reply = await this.cluster.invoke(
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
          await this.use((control) => control.validate(actor));
          if (this.peers.get(client.peer.id) === client)
            this.send(client, {
              type: "result",
              id: frame.id,
              result: this.result(frame.request.method, reply.result),
            });
          return;
        }
        const device = await this.localConnection(actor.userId, command.deviceId, connection.id);
        if (this.pending.size >= 1024) throw new ControlError("TOO_MANY_REQUESTS");
        const routeId = crypto.randomUUID();
        const timer = setTimeout(() => {
          const item = this.pending.get(routeId);
          if (item?.kind === "viewer") {
            this.pending.delete(routeId);
            this.send(client, {
              type: "result",
              id: item.id,
              result: { ok: false, code: "DELIVERY_EXPIRED" },
            });
          }
        }, 15_000);
        this.pending.set(routeId, {
          kind: "viewer",
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
            code:
              error instanceof ControlError || error instanceof JobError
                ? error.code
                : "NETWORK_UNAVAILABLE",
          },
        });
      }
      return;
    }
    if (frame.type === "observed") {
      if (!client.ready) throw new ControlError("FORBIDDEN");
      await this.use((control) => control.observed(actor, frame));
      this.send(client, { type: "observed_ack", epoch: frame.epoch, revision: frame.revision });
      await this.broadcast(actor, { type: "observed_changed", deviceId: actor.deviceId });
      return;
    }
    if (frame.type === "announce") {
      client.ready = false;
      const resume = await this.use((control) => control.announce(actor, frame));
      await this.cluster?.notify({
        type: "connected",
        userId: actor.userId,
        deviceId: actor.deviceId,
        connectionId: actor.connectionId,
      });
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
          ...(frame.syncId ? { syncId: frame.syncId } : {}),
        };
      const snapshot = client.snapshot;
      if (
        snapshot.streamId !== frame.streamId ||
        snapshot.sequence !== frame.sequence ||
        snapshot.syncId !== frame.syncId
      )
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
        await this.broadcast(actor, {
          type: "changed",
          deviceId: actor.deviceId,
          streamId: frame.streamId,
          sequence: frame.sequence,
          reset: true,
        });
        if (frame.syncId) {
          const pending = this.syncs.get(`${actor.userId}:${frame.syncId}`);
          if (pending?.device === client.peer.id && pending.epoch === actor.epoch)
            pending.complete({
              type: "synced",
              streamId: frame.streamId,
              sequence: frame.sequence,
            });
        }
      }
      return;
    }
    if (frame.type === "events") {
      const sequence = await this.use((control) =>
        control.events(actor, frame.streamId, frame.events),
      );
      client.cursor = { streamId: frame.streamId, sequence };
      this.send(client, { type: "ack", streamId: frame.streamId, sequence });
      await this.broadcast(actor, {
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
        await this.broadcast(actor, {
          type: "changed",
          deviceId: actor.deviceId,
          ...client.cursor,
        });
      return;
    }
    if (frame.type === "result") {
      const pending = this.pending.get(frame.routeId);
      if (!pending || pending.device !== client.peer.id) return;
      this.pending.delete(frame.routeId);
      clearTimeout(pending.timer);
      if (pending.kind === "job") {
        pending.complete(frame.result);
        return;
      }
      const viewer = this.peers.get(pending.viewer);
      if (!viewer?.actor) return;
      await this.use((control) => control.validate(viewer.actor!));
      const result = this.result(pending.method, frame.result);
      this.send(viewer, { type: "result", id: pending.id, result });
      return;
    }
    throw new ControlError("FORBIDDEN");
  }
  private async jobDevice(
    userId: string,
    run: CloudJobRun,
    signal: AbortSignal,
    expectedConnection?: string,
  ) {
    if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
    if (!this.ready()) throw new JobError("SERVER_UNAVAILABLE");
    if (!this.inRoom(userId)) throw new JobError("FORBIDDEN");
    try {
      await this.use((control) => control.validateJobTarget(userId, run.action));
      const device = [...this.peers.values()]
        .reverse()
        .find(
          (client) =>
            client.ready &&
            client.actor?.role === "device" &&
            client.actor.userId === userId &&
            client.actor.deviceId === run.action.deviceId &&
            client.actor.epoch === run.action.epoch,
        );
      if (!device?.actor) throw new JobError("DEVICE_OFFLINE");
      if (expectedConnection && device.actor.connectionId !== expectedConnection)
        throw new JobError("DEVICE_REPLACED");
      await this.use((control) => control.validateJobPeer(device.actor!, run.action));
      if (this.peers.get(device.peer.id) !== device || !device.ready)
        throw new JobError("DEVICE_OFFLINE");
      if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
      return device;
    } catch (error) {
      if (error instanceof JobError) throw error;
      throw new JobError(error instanceof ControlError ? error.code : "SERVER_UNAVAILABLE");
    }
  }
  private async forwardJob(
    type: "dispatch" | "sync",
    userId: string,
    run: CloudJobRun,
    signal: AbortSignal,
  ) {
    if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
    if (!this.inRoom(userId)) throw new JobError("FORBIDDEN");
    if (!this.cluster) return;
    try {
      await this.use((control) => control.validateJobTarget(userId, run.action));
    } catch (error) {
      throw new JobError(error instanceof ControlError ? error.code : "SERVER_UNAVAILABLE");
    }
    const connection = await this.remote(userId, run.action.deviceId);
    const owner = connection.id.split(":")[0]!;
    if (owner === this.cluster.nodeId) return;
    return this.cluster.invoke(owner, { type, userId, run, connectionId: connection.id }, signal);
  }
  /** Internal scheduling port; it never creates a viewer or a browser session. */
  async dispatch(
    userId: string,
    run: CloudJobRun,
    signal: AbortSignal,
    expectedConnection?: string,
  ): Promise<Extract<JobDispatchResult, { type: "task" }>> {
    if (run.action.type !== "agent.run" || run.taskId !== run.id)
      throw new JobError("IDEMPOTENCY_CONFLICT");
    if (!expectedConnection) {
      const reply = await this.forwardJob("dispatch", userId, run, signal);
      if (reply) {
        if (reply.type !== "task" || reply.taskId !== run.id)
          throw new JobError("INVALID_DEVICE_RESULT", true);
        return reply;
      }
    }
    const device = await this.jobDevice(userId, run, signal, expectedConnection),
      action = run.action;
    let command: Awaited<ReturnType<ControlService["route"]>>;
    try {
      command = await this.use((control) =>
        control.route(
          userId,
          run.id,
          {
            method: "tasks.create",
            input: {
              id: run.id,
              deviceId: action.deviceId,
              projectId: action.projectId,
              provider: action.provider,
              mode: action.mode,
              prompt: action.prompt,
              ...(action.contextSelection ? { contextSelection: action.contextSelection } : {}),
            },
          },
          action,
        ),
      );
      if (command.recoveredTask)
        return {
          type: "task",
          taskId: command.recoveredTask.id,
          status: command.recoveredTask.status,
        };
      await this.use((control) => control.validateJobPeer(device.actor!, run.action));
    } catch (error) {
      throw new JobError(error instanceof ControlError ? error.code : "SERVER_UNAVAILABLE");
    }
    if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
    if (this.peers.get(device.peer.id) !== device || !device.ready)
      throw new JobError("DEVICE_OFFLINE");
    if (this.pending.size >= 1024) throw new JobError("TOO_MANY_REQUESTS");
    return new Promise((resolve, reject) => {
      const routeId = crypto.randomUUID();
      let sent = false,
        settled = false;
      const complete = (result: DeviceResult, uncertain = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        this.pending.delete(routeId);
        if (!result.ok) {
          reject(
            new JobError(
              /^[A-Z][A-Z0-9_]{0,79}$/.test(result.code) ? result.code : "DEVICE_UNAVAILABLE",
              uncertain || (sent && !knownHostCreateRejections.has(result.code)),
            ),
          );
          return;
        }
        const parsed = taskSchema.safeParse(result.value);
        if (
          !parsed.success ||
          parsed.data.id !== run.id ||
          parsed.data.deviceId !== action.deviceId
        ) {
          reject(new JobError("INVALID_DEVICE_RESULT", true));
          return;
        }
        resolve({ type: "task", taskId: parsed.data.id, status: parsed.data.status });
      };
      const abort = () => complete({ ok: false, code: "REQUEST_TIMEOUT" }, sent);
      const timer = setTimeout(
        () => complete({ ok: false, code: "DELIVERY_EXPIRED" }, sent),
        15_000,
      );
      this.pending.set(routeId, {
        kind: "job",
        device: device.peer.id,
        id: run.id,
        method: "tasks.create",
        timer,
        complete,
      });
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      sent = true;
      this.send(device, { type: "command", routeId, command });
    });
  }
  /** Resolve only after the correlated complete snapshot transaction commits. */
  async sync(
    userId: string,
    run: CloudJobRun,
    signal: AbortSignal,
    expectedConnection?: string,
  ): Promise<Synced> {
    if (run.action.type !== "device.sync") throw new JobError("INVALID_INPUT");
    if (!expectedConnection) {
      const reply = await this.forwardJob("sync", userId, run, signal);
      if (reply) {
        if (reply.type !== "synced") throw new JobError("INVALID_DEVICE_RESULT", true);
        return reply;
      }
    }
    const device = await this.jobDevice(userId, run, signal, expectedConnection);
    if (!device.cursor) throw new JobError("DEVICE_OFFLINE");
    const key = `${userId}:${run.id}`,
      previous = this.syncs.get(key);
    if (previous) {
      if (previous.device !== device.peer.id || previous.epoch !== run.action.epoch)
        throw new JobError("IDEMPOTENCY_CONFLICT");
      return previous.promise;
    }
    if (this.syncs.size >= 1024) throw new JobError("TOO_MANY_REQUESTS");
    if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
    const { promise, resolve, reject } = Promise.withResolvers<Synced>();
    let sent = false,
      settled = false;
    const complete: SyncPending["complete"] = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      this.syncs.delete(key);
      if (value instanceof JobError) reject(value);
      else resolve(value);
    };
    const abort = () => complete(new JobError("REQUEST_TIMEOUT", sent));
    const timer = setTimeout(() => complete(new JobError("DELIVERY_EXPIRED", sent)), 15_000);
    this.syncs.set(key, { device: device.peer.id, epoch: run.action.epoch, promise, complete });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else {
      sent = true;
      this.send(device, { type: "resume", ...device.cursor, snapshot: true, syncId: run.id });
    }
    return promise;
  }
  close(id: string): Promise<void> {
    const closing = this.closing.get(id);
    if (closing) return closing;
    const client = this.peers.get(id);
    if (!client) return Promise.resolve();
    this.peers.delete(id);
    client.abort.abort();
    clearTimeout(client.timer);
    for (const [route, item] of this.pending)
      if ((item.kind === "viewer" && item.viewer === id) || item.device === id) {
        clearTimeout(item.timer);
        this.pending.delete(route);
        if (item.kind === "job") {
          item.complete({ ok: false, code: "DEVICE_OFFLINE" }, true);
          continue;
        }
        const viewer = this.peers.get(item.viewer);
        if (viewer)
          this.send(viewer, {
            type: "result",
            id: item.id,
            result: { ok: false, code: "DEVICE_OFFLINE" },
          });
      }
    for (const item of this.syncs.values())
      if (item.device === id) item.complete(new JobError("DEVICE_OFFLINE", true));
    const cleanup = (async () => {
      await client.chain;
      clearTimeout(client.timer);
      if (client.actor?.role === "device") {
        await this.use((control) => control.disconnect(client.actor!));
        if (client.cursor)
          await this.broadcast(client.actor, {
            type: "changed",
            deviceId: client.actor.deviceId,
            ...client.cursor,
          });
      }
    })().finally(() => this.closing.delete(id));
    this.closing.set(id, cleanup);
    return cleanup;
  }
  private revokeLocal(userId: string, deviceId: string) {
    for (const client of this.peers.values())
      if (client.actor?.userId === userId && client.actor.deviceId === deviceId)
        client.peer.close(4003, "Device revoked");
  }
  async revoke(userId: string, deviceId: string) {
    this.revokeLocal(userId, deviceId);
    await this.cluster?.notify({ type: "revoke", userId, deviceId });
  }
  async shutdown() {
    this.stopping = true;
    await this.cluster?.close();
    const clients = [...this.peers.values()];
    for (const client of clients) client.peer.close(1001, "Server stopping");
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      if (item.kind === "job") item.complete({ ok: false, code: "SERVER_UNAVAILABLE" }, true);
    }
    for (const item of this.syncs.values()) item.complete(new JobError("SERVER_UNAVAILABLE", true));
    for (const client of this.peers.values()) clearTimeout(client.timer);
    this.pending.clear();
    await Promise.allSettled(clients.map((client) => this.close(client.peer.id)));
    await Promise.allSettled(this.closing.values());
  }
}
