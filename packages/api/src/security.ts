import { HttpError, type RequestContext, type RequestGuard } from "./http.js";

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Maximum active client buckets; new clients fail closed when capacity is full. */
  maxKeys?: number;
  /** Millisecond clock, injectable for deterministic tests. */
  now?: () => number;
}
export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}
export interface RateLimiter {
  /** Synchronous reservation makes concurrent handlers share the same quota. */
  consume(key?: string): RateLimitDecision;
  clear(): void;
}
export interface RateLimitGuardOptions {
  limiter: RateLimiter;
  /** Supply a trusted identity at the composition root. Proxy headers are not read. */
  key?: (request: Request, context: RequestContext) => string;
}
export interface SameOriginOptions {
  /** Canonical public HTTP(S) origin configured by the application, not request Host. */
  origin: string;
  /** Explicit exemption for non-browser endpoints that use another authentication mechanism. */
  allowMissingOrigin?: boolean;
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer`);
}

/**
 * Creates a bounded process-local fixed-window limiter. Windows start on a client's
 * first request. It does not read cookies, IP headers, or contact an external store.
 * Multiple replicas need an application-provided shared RateLimiter implementation.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  positiveInteger(options.limit, "Rate limit");
  positiveInteger(options.windowMs, "Rate limit window");
  const maxKeys = options.maxKeys ?? 10_000;
  positiveInteger(maxKeys, "Rate limit capacity");
  const buckets = new Map<string, { count: number; resetAtMs: number }>();
  const clock = options.now ?? Date.now;
  let previousTime = 0;
  let nextSweep = 0;

  return {
    consume(key = "anonymous") {
      if (key.length < 1 || key.length > 256)
        throw new Error("Rate limit key must contain 1-256 characters");
      const clockTime = clock();
      if (!Number.isFinite(clockTime) || clockTime < 0)
        throw new Error("Rate limit clock must be finite and non-negative");
      const now = Math.max(previousTime, clockTime);
      previousTime = now;
      if (now >= nextSweep) {
        for (const [client, bucket] of buckets) if (bucket.resetAtMs <= now) buckets.delete(client);
        nextSweep = now + Math.min(options.windowMs, 1000);
      }
      let bucket = buckets.get(key);
      if (bucket && bucket.resetAtMs <= now) {
        buckets.delete(key);
        bucket = undefined;
      }
      if (!bucket) {
        if (buckets.size >= maxKeys) {
          // Reclaim expired slots even between scheduled sweeps before failing closed.
          for (const [client, current] of buckets)
            if (current.resetAtMs <= now) buckets.delete(client);
        }
        if (buckets.size >= maxKeys) {
          let resetAtMs = now + options.windowMs;
          for (const current of buckets.values())
            resetAtMs = Math.min(resetAtMs, current.resetAtMs);
          return {
            allowed: false,
            limit: options.limit,
            remaining: 0,
            resetAtMs,
            retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
          };
        }
        bucket = { count: 0, resetAtMs: now + options.windowMs };
        buckets.set(key, bucket);
      }
      const allowed = bucket.count < options.limit;
      if (allowed) bucket.count++;
      return {
        allowed,
        limit: options.limit,
        remaining: Math.max(0, options.limit - bucket.count),
        resetAtMs: bucket.resetAtMs,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAtMs - now) / 1000)),
      };
    },
    clear() {
      buckets.clear();
    },
  };
}

/** Applies one quota before business work; both successful and blocked responses carry limits. */
export function createRateLimitGuard(options: RateLimitGuardOptions): RequestGuard {
  return (request, context) => {
    const decision = options.limiter.consume(options.key?.(request, context));
    const headers = new Headers({
      "x-ratelimit-limit": String(decision.limit),
      "x-ratelimit-remaining": String(decision.remaining),
      "x-ratelimit-reset": String(Math.ceil(decision.resetAtMs / 1000)),
    });
    if (!decision.allowed) {
      headers.set("retry-after", String(decision.retryAfterSeconds));
      throw new HttpError("RATE_LIMITED", undefined, { headers });
    }
    return headers;
  };
}

function httpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if ((url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password)
      return url;
  } catch {
    /* Invalid external source metadata is denied below. */
  }
  return undefined;
}

function canonicalOrigin(value: string): string {
  const url = httpUrl(value);
  if (!url || url.pathname !== "/" || url.search || url.hash)
    throw new Error("Same-origin protection requires a canonical HTTP(S) origin");
  return url.origin;
}

function checkSameOrigin(request: Request, origin: string, allowMissingOrigin: boolean): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return;
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError("FORBIDDEN");
  const supplied = request.headers.get("origin");
  if (supplied !== null) {
    const url = httpUrl(supplied);
    if (!url || supplied !== url.origin || url.origin !== origin) throw new HttpError("FORBIDDEN");
    return;
  }
  const referer = request.headers.get("referer");
  if (referer !== null) {
    if (httpUrl(referer)?.origin !== origin) throw new HttpError("FORBIDDEN");
    return;
  }
  if (!allowMissingOrigin) throw new HttpError("FORBIDDEN");
}

/**
 * Rejects unsafe browser requests from another origin with a fixed public 403.
 * Origin takes precedence over Referer; missing metadata fails closed by default.
 * Use a route-scoped exemption only for separately authenticated non-browser work.
 */
export function assertSameOrigin(request: Request, options: SameOriginOptions): void {
  checkSameOrigin(request, canonicalOrigin(options.origin), options.allowMissingOrigin === true);
}

/** Validates the configured origin once, then checks write requests before their handler. */
export function createSameOriginGuard(options: SameOriginOptions): RequestGuard {
  const origin = canonicalOrigin(options.origin);
  return (request) => checkSameOrigin(request, origin, options.allowMissingOrigin === true);
}
