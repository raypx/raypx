import {
  relayServerSchema,
  MAX_RELAY_BYTES,
  type RelayClientFrame,
  type RelayServerFrame,
} from "@raypx/contracts/api";

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
  private retry: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private enabled = false;
  private generation = 0;
  private failures = 0;
  private lastMessage = 0;
  private fallbackVersion: 2 | undefined;
  private attemptedVersion: 2 | 3 = 2;
  private accepted = false;
  private contextAvailable = false;
  get contextSupported() {
    return this.contextAvailable;
  }
  constructor(
    private readonly options: {
      url: string;
      authenticate: () => Promise<Extract<RelayClientFrame, { type: "auth" }>>;
      message: (frame: RelayServerFrame) => void;
      status: (connected: boolean, code?: string) => void;
      protocolChanged?: (version: 2 | 3) => void;
      socket?: RelaySocketFactory;
    },
  ) {}
  start() {
    if (this.enabled) return;
    this.enabled = true;
    this.fallbackVersion = undefined;
    this.connect();
  }
  restart() {
    this.stop();
    this.start();
  }
  private connect() {
    if (!this.enabled) return;
    const generation = ++this.generation;
    this.accepted = false;
    this.contextAvailable = false;
    try {
      const socket = (this.options.socket ?? ((url) => new WebSocket(url)))(this.options.url);
      this.socket = socket;
      socket.addEventListener("open", () => {
        void this.options.authenticate().then(
          (frame) => {
            if (this.enabled && generation === this.generation) {
              this.attemptedVersion = this.fallbackVersion ?? frame.protocolVersion;
              this.send({ ...frame, protocolVersion: this.attemptedVersion });
            }
          },
          () => {
            if (generation === this.generation) socket.close(4001, "Authentication unavailable");
          },
        );
      });
      socket.addEventListener("message", (event) => {
        if (generation !== this.generation) return;
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
            (!("protocolVersion" in raw) || ![2, 3].includes(Number(raw.protocolVersion)))
          ) {
            socket.close(4006, "UPGRADE_REQUIRED");
            return;
          }
          const frame = relayServerSchema.parse(raw);
          if (frame.type === "pong" || frame.type === "changed") this.failures = 0;
          this.lastMessage = Date.now();
          if (frame.type === "ready") {
            this.accepted = true;
            this.contextAvailable = frame.contextSupported === true;
            this.options.protocolChanged?.(frame.protocolVersion);
            this.options.status(true);
            this.heartbeat = setInterval(() => {
              if (Date.now() - this.lastMessage > 45_000) socket.close(4000, "Heartbeat timeout");
              else this.send({ type: "ping" });
            }, 15_000);
          }
          this.options.message(frame);
        } catch {
          socket.close(4000, "Invalid relay frame");
        }
      });
      socket.addEventListener("error", () => socket.close());
      socket.addEventListener("close", (event) => {
        if (generation !== this.generation) return;
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = undefined;
        this.socket = undefined;
        this.contextAvailable = false;
        const fallback =
          event.code === 4006 &&
          !this.accepted &&
          this.attemptedVersion === 3 &&
          this.fallbackVersion === undefined;
        if (fallback) {
          this.fallbackVersion = 2;
          this.options.protocolChanged?.(2);
        } else if (this.accepted) this.fallbackVersion = undefined;
        this.options.status(
          false,
          event.code === 4006 && !fallback
            ? "UPGRADE_REQUIRED"
            : event.code === 4003
              ? "DEVICE_REVOKED"
              : event.code === 4001
                ? "AUTH_REQUIRED"
                : "NETWORK_UNAVAILABLE",
        );
        if (event.code === 4006 && !fallback) this.enabled = false;
        if (this.enabled && generation === this.generation)
          this.retry = setTimeout(
            () => this.connect(),
            Math.min(30_000, 500 * 2 ** Math.min(this.failures++, 6)) * (0.8 + Math.random() * 0.2),
          );
      });
    } catch {
      this.options.status(false, "NETWORK_UNAVAILABLE");
      if (this.enabled && generation === this.generation)
        this.retry = setTimeout(
          () => this.connect(),
          Math.min(30_000, 500 * 2 ** Math.min(this.failures++, 6)) * (0.8 + Math.random() * 0.2),
        );
    }
  }
  send(frame: RelayClientFrame) {
    if (
      frame.type === "request" &&
      frame.request.method === "tasks.create" &&
      frame.request.input.contextSelection?.sources.length &&
      !this.contextAvailable
    )
      throw new Error("UPGRADE_REQUIRED");
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
    this.contextAvailable = false;
    this.generation++;
    if (this.retry) clearTimeout(this.retry);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.retry = undefined;
    this.heartbeat = undefined;
    this.socket?.close(1000, "Disconnected");
    this.socket = undefined;
  }
}
