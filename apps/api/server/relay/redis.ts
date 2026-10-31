import { Redis } from "ioredis";
import { z } from "zod";
import { JobError } from "@raypx/jobs";
import { MAX_RELAY_BYTES } from "@raypx/contracts/tasks";
import {
  relayNoticeSchema,
  relayOperationSchema,
  relayReplySchema,
  type RelayCluster,
  type RelayNotice,
  type RelayOperation,
  type RelayReply,
} from "./cluster.js";

const address = { from: z.uuid(), to: z.uuid(), id: z.uuid() };
const packetSchema = z.discriminatedUnion("kind", [
  z.object({
    ...address,
    kind: z.literal("request"),
    deadline: z.number(),
    operation: relayOperationSchema,
  }),
  z.object({
    ...address,
    kind: z.literal("reply"),
    outcome: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), value: relayReplySchema }),
      z.object({
        ok: z.literal(false),
        code: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
        uncertain: z.boolean(),
      }),
    ]),
  }),
  z.object({ ...address, kind: z.literal("cancel") }),
  z.object({ kind: z.literal("notice"), from: z.uuid(), value: relayNoticeSchema }),
]);
type Packet = z.output<typeof packetSchema>;
const MAX_PACKET_BYTES = MAX_RELAY_BYTES + 64 * 1024;
const MAX_INFLIGHT = 256;
const MAX_QUEUED_BYTES = 8 * 1024 * 1024;
const REQUEST_MS = 15_000;

/** Private, bounded, at-most-once transport. PostgreSQL remains the ownership authority. */
export class RedisRelayCluster implements RelayCluster {
  readonly nodeId = crypto.randomUUID();
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly pending = new Map<
    string,
    { peer: string; complete(value: RelayReply | JobError): void }
  >();
  private readonly active = new Map<string, { from: string; abort: AbortController }>();
  private subscribed = false;
  private closing = false;
  private queuedBytes = 0;
  private activeBytes = 0;
  private generation = 0;
  private recovery: ReturnType<typeof setTimeout> | undefined;
  private readonly receiving = new Set<Promise<void>>();
  private handle: Parameters<RelayCluster["start"]>[0] | undefined;
  private notice: Parameters<RelayCluster["start"]>[1] | undefined;
  private unavailable = () => {};
  private readonly readyWaiters = new Set<() => void>();
  constructor(
    url: string,
    private readonly prefix = "raypx:relay:",
  ) {
    this.publisher = new Redis(url, {
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      maxRetriesPerRequest: 0,
      commandTimeout: 3000,
      connectionName: `raypx-relay:${this.nodeId}:publisher`,
    });
    this.subscriber = this.publisher.duplicate({
      autoResubscribe: false,
      connectionName: `raypx-relay:${this.nodeId}:subscriber`,
    });
    for (const client of [this.publisher, this.subscriber]) {
      client.on("error", () => {});
      client.on("close", () => this.lost());
    }
    this.publisher.on("ready", () => {
      void this.subscribe();
    });
    this.subscriber.on("ready", () => {
      void this.subscribe();
    });
    this.subscriber.on("message", (_channel, value) => {
      if (this.receiving.size >= MAX_INFLIGHT * 2) {
        this.lost();
        return;
      }
      const receiving = this.receive(value)
        .catch(() => this.lost())
        .finally(() => this.receiving.delete(receiving));
      this.receiving.add(receiving);
    });
  }
  ready() {
    return !this.closing && this.subscribed && this.publisher.status === "ready";
  }
  private wakeReady() {
    if (this.ready()) for (const ready of this.readyWaiters) ready();
  }
  private async subscribe() {
    if (
      this.closing ||
      !this.handle ||
      this.subscriber.status !== "ready" ||
      this.publisher.status !== "ready"
    )
      return;
    const generation = this.generation;
    try {
      await this.subscriber.subscribe(this.prefix + this.nodeId, this.prefix + "notices");
      if (!this.closing && generation === this.generation) {
        this.subscribed = true;
        this.wakeReady();
      }
    } catch {
      this.lost();
    }
  }
  async start(
    handle: Parameters<RelayCluster["start"]>[0],
    notice: Parameters<RelayCluster["start"]>[1],
    unavailable: () => void,
  ) {
    this.handle = handle;
    this.notice = notice;
    this.unavailable = unavailable;
    void this.subscribe();
    if (this.ready()) return;
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        this.readyWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(() => {
        this.readyWaiters.delete(done);
        reject(new JobError("SERVER_UNAVAILABLE"));
      }, 3000);
      this.readyWaiters.add(done);
      this.wakeReady();
    });
  }
  private lost() {
    this.generation++;
    this.subscribed = false;
    for (const pending of this.pending.values())
      pending.complete(new JobError("SERVER_UNAVAILABLE", true));
    for (const active of this.active.values()) active.abort.abort();
    if (!this.closing) this.unavailable();
    if (!this.closing && !this.recovery)
      this.recovery = setTimeout(() => {
        this.recovery = undefined;
        void this.subscribe();
      }, 250);
  }
  private async publish(channel: string, packet: Packet) {
    if (!this.ready()) throw new JobError("SERVER_UNAVAILABLE");
    const value = JSON.stringify(packet),
      bytes = Buffer.byteLength(value);
    if (bytes > MAX_PACKET_BYTES || this.queuedBytes + bytes > MAX_QUEUED_BYTES)
      throw new JobError("TOO_MANY_REQUESTS");
    this.queuedBytes += bytes;
    try {
      return await this.publisher.publish(channel, value);
    } catch {
      this.lost();
      throw new JobError("SERVER_UNAVAILABLE", true);
    } finally {
      this.queuedBytes -= bytes;
    }
  }
  async invoke(
    nodeId: string,
    operation: RelayOperation,
    signal: AbortSignal,
  ): Promise<RelayReply> {
    if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
    if (!this.ready()) throw new JobError("SERVER_UNAVAILABLE");
    if (nodeId === this.nodeId) throw new JobError("INVALID_INPUT");
    if (this.pending.size >= MAX_INFLIGHT) throw new JobError("TOO_MANY_REQUESTS");
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      let sent = false,
        settled = false;
      const complete = (value: RelayReply | JobError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        this.pending.delete(id);
        if (value instanceof JobError) reject(value);
        else resolve(value);
      };
      const cancel = () => {
        complete(new JobError("REQUEST_TIMEOUT", sent));
        if (sent)
          void this.publish(this.prefix + nodeId, {
            kind: "cancel",
            from: this.nodeId,
            to: nodeId,
            id,
          }).catch(() => {});
      };
      const timer = setTimeout(() => {
        cancel();
      }, REQUEST_MS);
      this.pending.set(id, { peer: nodeId, complete });
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) {
        cancel();
        return;
      }
      // A publish error can occur after delivery. Never retry or claim it did not execute.
      sent = true;
      void this.publish(this.prefix + nodeId, {
        kind: "request",
        from: this.nodeId,
        to: nodeId,
        id,
        deadline: Date.now() + REQUEST_MS,
        operation,
      }).then(
        (subscribers) => {
          if (!subscribers) complete(new JobError("DEVICE_OFFLINE"));
        },
        (error: unknown) =>
          complete(error instanceof JobError ? error : new JobError("SERVER_UNAVAILABLE", true)),
      );
    });
  }
  async notify(value: RelayNotice) {
    await this.publish(this.prefix + "notices", { kind: "notice", from: this.nodeId, value });
  }
  private async receive(value: string) {
    if (this.closing || Buffer.byteLength(value) > MAX_PACKET_BYTES) return;
    let raw: unknown;
    try {
      raw = JSON.parse(value);
    } catch {
      return;
    }
    const parsed = packetSchema.safeParse(raw);
    if (!parsed.success || parsed.data.from === this.nodeId) return;
    const packet = parsed.data;
    if (packet.kind === "notice") {
      await this.notice?.(packet.value);
      return;
    }
    if (packet.to !== this.nodeId) return;
    if (packet.kind === "reply") {
      const pending = this.pending.get(packet.id);
      if (pending?.peer === packet.from)
        pending.complete(
          packet.outcome.ok
            ? packet.outcome.value
            : new JobError(packet.outcome.code, packet.outcome.uncertain),
        );
      return;
    }
    if (packet.kind === "cancel") {
      const active = this.active.get(packet.id);
      if (active?.from === packet.from) active.abort.abort();
      return;
    }
    if (this.active.has(packet.id)) return;
    const remaining = Math.min(REQUEST_MS, packet.deadline - Date.now());
    if (remaining <= 0) return;
    let outcome: Extract<Packet, { kind: "reply" }>["outcome"];
    if (
      this.active.size >= MAX_INFLIGHT ||
      this.activeBytes + Buffer.byteLength(value) > MAX_QUEUED_BYTES
    ) {
      outcome = { ok: false, code: "TOO_MANY_REQUESTS", uncertain: false };
    } else {
      const abort = new AbortController(),
        timer = setTimeout(() => abort.abort(), remaining);
      this.active.set(packet.id, { from: packet.from, abort });
      this.activeBytes += Buffer.byteLength(value);
      try {
        if (!this.handle) throw new JobError("SERVER_UNAVAILABLE");
        outcome = { ok: true, value: await this.handle(packet.operation, abort.signal) };
      } catch (error) {
        outcome =
          error instanceof JobError
            ? {
                ok: false,
                code: /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code) ? error.code : "SERVER_UNAVAILABLE",
                uncertain: error.uncertain,
              }
            : { ok: false, code: "SERVER_UNAVAILABLE", uncertain: true };
      } finally {
        clearTimeout(timer);
        this.active.delete(packet.id);
        this.activeBytes -= Buffer.byteLength(value);
      }
    }
    if (!this.closing)
      await this.publish(this.prefix + packet.from, {
        kind: "reply",
        from: this.nodeId,
        to: packet.from,
        id: packet.id,
        outcome,
      });
  }
  async close() {
    if (this.closing) return;
    this.closing = true;
    this.lost();
    clearTimeout(this.recovery);
    this.publisher.disconnect();
    this.subscriber.disconnect();
    await Promise.allSettled(this.receiving);
  }
}
