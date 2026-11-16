import type { FetchCallable } from "./api.js";

export function retryAfterMs(headers: Headers, now = Date.now()): number {
  const value = headers.get("retry-after") ?? headers.get("x-retry-after");
  if (!value) return 0;
  const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.min(2_147_483_647, Math.max(0, delay)) : 0;
}

/** One circuit per selected origin in a renderer. It never replays the failed request. */
export class OriginRecovery {
  private state: "ready" | "updating" = "ready";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private retryAt = 0;
  private readonly listeners = new Set<() => void>();
  constructor(
    readonly origin: string,
    private readonly transport: FetchCallable,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: typeof this.state) {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  private unavailable() {
    return Response.json(
      { code: "DEPLOYMENT_UPDATING" },
      {
        status: 503,
        headers: {
          "retry-after": String(Math.max(1, Math.ceil((this.retryAt - Date.now()) / 1000))),
        },
      },
    );
  }
  fetch = async (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? new Request(input, init) : undefined;
    const address = request?.url ?? (input instanceof URL ? input.href : (input as string));
    if (request)
      init = {
        method: request.method,
        headers: request.headers,
        body: request.body,
        credentials: request.credentials,
        signal: request.signal,
        ...(request.body ? { duplex: "half" } : {}),
      };
    init?.signal?.throwIfAborted();
    if (this.state === "updating") return this.unavailable();
    try {
      const response = await this.transport(address, init);
      const path = new URL(address, this.origin).pathname;
      const backgroundLimit =
        response.status === 429 &&
        (path === "/api/auth/get-session" ||
          path.startsWith("/api/rpc/") ||
          path === "/api/events");
      const serviceUnavailable =
        response.status === 503 &&
        (response.headers.get("x-raypx-service") !== "api" ||
          response.headers.get("x-raypx-state") === "updating" ||
          path === "/api/auth/get-session");
      if (backgroundLimit || serviceUnavailable || [502, 504].includes(response.status))
        this.pause(retryAfterMs(response.headers));
      return response;
    } catch (error) {
      if (!init?.signal?.aborted || init.signal.reason?.name === "TimeoutError") this.pause();
      throw error;
    }
  };
  pause(minimumMs = 0) {
    // Many simultaneous requests may fail. They join the same schedule without
    // increasing its exponent or bringing a Retry-After deadline forward.
    const deadline = Date.now() + minimumMs;
    if (this.state === "updating" && deadline <= this.retryAt) return;
    this.publish("updating");
    clearTimeout(this.timer);
    const delay = Math.max(
      minimumMs,
      Math.min(30_000, 1000 * 2 ** this.attempt * (0.75 + Math.random() * 0.5)),
    );
    this.retryAt = Date.now() + delay;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.probe();
    }, delay);
  }
  private async probe() {
    let delay = 0;
    try {
      const response = await this.transport(new URL("/ready", this.origin).href, {
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(5000),
      });
      delay = retryAfterMs(response.headers);
      await response.body?.cancel();
      if (response.ok && response.headers.get("x-raypx-service") === "api") {
        this.attempt = 0;
        this.retryAt = 0;
        this.publish("ready");
        return;
      }
    } catch {
      /* Only the next readiness probe retries; callers never replay mutations. */
    }
    this.attempt = Math.min(this.attempt + 1, 5);
    this.retryAt = 0;
    this.pause(delay);
  }
  dispose() {
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}

const origins = new Map<string, OriginRecovery>();
export function originRecovery(
  origin: string,
  transport: FetchCallable = (input, init) => globalThis.fetch(input, init),
): OriginRecovery {
  const key = new URL(origin).origin;
  let recovery = origins.get(key);
  if (!recovery) {
    recovery = new OriginRecovery(key, transport);
    origins.set(key, recovery);
  }
  return recovery;
}
export function existingOriginRecovery(origin: string): OriginRecovery | undefined {
  return origins.get(new URL(origin).origin);
}
