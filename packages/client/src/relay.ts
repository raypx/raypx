export { AcknowledgedStream, type StreamCursor } from "./acknowledged-stream.js";
import { systemRelayScheduler, type RelayScheduler } from "./scheduler.js";
import {
  relayServerSchema,
  RELAY_VERSION,
  MAX_RELAY_BYTES,
  type RelayClientFrame,
  type RelayServerFrame,
} from "@raypx/contracts/api";

export { systemRelayScheduler, type RelayScheduler } from "./scheduler.js";

const closeReasons = new Map([
  [4006, "UPGRADE_REQUIRED"],
  [4003, "DEVICE_REVOKED"],
  [4001, "AUTH_REQUIRED"],
]);

export type RelaySocketFactory = (url: string) => WebSocket;
export function relayUrl(baseUrl: string, accountId?: string) {
  const url = new URL("/relay", baseUrl);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new Error("RELAY_REQUIRES_HTTPS");
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (accountId) url.searchParams.set("account", accountId);
  return url.href;
}
export class RelayConnection {
  private socket: WebSocket | undefined;
  private retry: (() => void) | undefined;
  private heartbeat: (() => void) | undefined;
  private enabled = false;
  private lifetime: AbortController | undefined;
  private scope: AbortController | undefined;
  private failures = 0;
  private lastMessage = 0;
  constructor(
    private readonly options: {
      url: string;
      authenticate: (signal: AbortSignal) => Promise<Extract<RelayClientFrame, { type: "auth" }>>;
      message: (frame: RelayServerFrame, signal: AbortSignal) => void;
      status: (connected: boolean, code?: string, signal?: AbortSignal) => void;
      socket?: RelaySocketFactory;
      scheduler?: RelayScheduler;
    },
  ) {}
  private get scheduler() {
    return this.options.scheduler ?? systemRelayScheduler;
  }
  start() {
    if (this.enabled) return;
    this.enabled = true;
    this.lifetime = new AbortController();
    this.connect();
  }
  restart() {
    this.stop();
    this.start();
  }
  private connect() {
    if (!this.enabled) return;
    const lifetime = this.lifetime!;
    this.scope?.abort();
    const scope = new AbortController();
    this.scope = scope;
    try {
      const socket = (this.options.socket ?? ((url) => new WebSocket(url)))(this.options.url);
      this.socket = socket;
      socket.addEventListener("open", () => {
        if (scope.signal.aborted) return;
        void Promise.resolve()
          .then(() => {
            scope.signal.throwIfAborted();
            return this.options.authenticate(scope.signal);
          })
          .then(
            (frame) => {
              if (!lifetime.signal.aborted && !scope.signal.aborted) {
                this.send(frame);
              }
            },
            () => {
              if (!scope.signal.aborted) socket.close(4001, "Authentication unavailable");
            },
          )
          .catch(() => {
            if (!scope.signal.aborted) socket.close(4001, "Authentication unavailable");
          });
      });
      socket.addEventListener("message", (event) => {
        if (scope.signal.aborted) return;
        try {
          if (
            typeof event.data !== "string" ||
            new TextEncoder().encode(event.data).byteLength > MAX_RELAY_BYTES
          )
            throw new Error("Invalid relay frame");
          const raw: unknown = JSON.parse(event.data);
          if (
            raw &&
            typeof raw === "object" &&
            "type" in raw &&
            raw.type === "ready" &&
            (!("protocolVersion" in raw) || raw.protocolVersion !== RELAY_VERSION)
          ) {
            socket.close(4006, "UPGRADE_REQUIRED");
            return;
          }
          const frame = relayServerSchema.parse(raw);
          if (frame.type === "pong" || frame.type === "changed") this.failures = 0;
          this.lastMessage = this.scheduler.now();
          if (frame.type === "ready") {
            this.options.status(true, undefined, scope.signal);
            if (scope.signal.aborted) return;
            this.heartbeat?.();
            this.heartbeat = this.scheduler.interval(() => {
              if (scope.signal.aborted) return;
              if (this.scheduler.now() - this.lastMessage > 45_000)
                socket.close(4000, "Heartbeat timeout");
              else this.send({ type: "ping" });
            }, 15_000);
          }
          this.options.message(frame, scope.signal);
        } catch {
          socket.close(4000, "Invalid relay frame");
        }
      });
      socket.addEventListener("error", () => {
        if (!scope.signal.aborted) socket.close();
      });
      socket.addEventListener("close", (event) => {
        if (scope.signal.aborted) return;
        scope.abort();
        if (this.heartbeat) this.heartbeat();
        this.heartbeat = undefined;
        this.socket = undefined;
        if (event.code === 4006) this.enabled = false;
        this.options.status(
          false,
          closeReasons.get(event.code) ?? "NETWORK_UNAVAILABLE",
          scope.signal,
        );
        if (this.enabled && !lifetime.signal.aborted)
          this.retry = this.scheduler.timeout(
            () => {
              if (!lifetime.signal.aborted) this.connect();
            },
            Math.min(30_000, 500 * 2 ** Math.min(this.failures++, 6)) *
              (0.8 + this.scheduler.random() * 0.2),
          );
      });
    } catch {
      scope.abort();
      this.options.status(false, "NETWORK_UNAVAILABLE", scope.signal);
      if (this.enabled && !lifetime.signal.aborted)
        this.retry = this.scheduler.timeout(
          () => {
            if (!lifetime.signal.aborted) this.connect();
          },
          Math.min(30_000, 500 * 2 ** Math.min(this.failures++, 6)) *
            (0.8 + this.scheduler.random() * 0.2),
        );
    }
  }
  send(frame: RelayClientFrame) {
    const value = JSON.stringify(frame);
    if (new TextEncoder().encode(value).byteLength > MAX_RELAY_BYTES)
      throw new Error("RELAY_FRAME_LIMIT");
    if (this.socket?.readyState !== 1) throw new Error("NETWORK_UNAVAILABLE");
    if (this.socket.bufferedAmount > 2 * MAX_RELAY_BYTES) {
      this.socket.close(4000, "Backpressure");
      throw new Error("NETWORK_UNAVAILABLE");
    }
    this.socket.send(value);
    if (frame.type === "available") this.failures = 0;
  }
  stop() {
    this.enabled = false;
    this.lifetime?.abort();
    this.scope?.abort();
    this.lifetime = undefined;
    this.scope = undefined;
    if (this.retry) this.retry();
    if (this.heartbeat) this.heartbeat();
    this.retry = undefined;
    this.heartbeat = undefined;
    this.socket?.close(1000, "Disconnected");
    this.socket = undefined;
  }
}
