# @raypx/api

Server business and HTTP foundations, independent of TanStack Start and port listening.

- `@raypx/api/health`: lightweight liveness, readiness for registered resources, and contract-based API 404 responses.
- `@raypx/api/http`: `withHttpRequest`, `getRequestContext`, `HttpError`, `errorResponse` and `parseJsonBody`.
- `@raypx/api/runtime`: `RuntimeLifecycle` and the resource check/dispose interface.
- `@raypx/api/metrics`: bounded HTTP counters, duration histograms and Prometheus text export.
- `@raypx/api/security`: process-local rate limiting and same-origin write guards.

The web server adapter wraps HTTP and SSR requests once. A validated or generated `x-request-id` is returned and shared with access/error logs. Unexpected errors return a safe public message; business failures use the `contracts/errors` code and field-error schema. `parseJsonBody(request, schema)` validates external JSON before business code runs.

`isHttpError` recognizes deliberate errors across independently compiled server bundles with a process-wide Symbol brand and weak instance registry. It also verifies the fixed public code/status/message, native Headers and optional field-error schema. Plain objects, forged brands and modified error metadata become safe internal failures; legal field errors and response headers survive a bundle boundary.

Wrap each API adapter before handing it to the framework. Nested wrappers reuse the global request context and produce one access log, while preserving deliberate errors before the framework catches them:

```ts
// Application .server.ts adapter; schema comes from the contracts package.
import { HttpError, parseJsonBody, withHttpRequest } from "@raypx/api/http";
import { createItemSchema } from "@raypx/contracts/items";

export const createItem = ({ request }: { request: Request }) =>
  withHttpRequest(request, async ({ logger }) => {
    const input = await parseJsonBody(request, createItemSchema);
    if (!canCreate(input)) throw new HttpError("FORBIDDEN");
    const item = await saveItem(input);
    logger.info("Item created", { itemId: item.id });
    return Response.json(item, { status: 201 });
  });
```

The example assumes application-specific `canCreate`, `saveItem`, and a new contracts schema. The existing health adapters demonstrate the complete wiring. Keep server imports in `.server.ts` files and use the JSON client transport from browser code.

The runtime registers only initialized resources. Required checks affect readiness; optional failures are reported without making the service unavailable. Probes have a deadline. Shutdown marks readiness unavailable and disposes resources once in reverse creation order within a total deadline.

The initial app does not initialize unused database, auth, cache or worker providers. As those features are enabled, register their real checks and cleanup in the application composition root. Request observers and logging failures cannot alter successful business responses.

Create shared policies once in the server composition root, then pass them to the HTTP boundary:

```ts
import { withHttpRequest } from "@raypx/api/http";
import { createHttpMetrics } from "@raypx/api/metrics";
import {
  createRateLimiter,
  createRateLimitGuard,
  createSameOriginGuard,
} from "@raypx/api/security";

const metrics = createHttpMetrics({ routes: ["/api/items", "/api/items/$id"] });
const limiter = createRateLimiter({ limit: 100, windowMs: 60_000 });
const limit = createRateLimitGuard({ limiter });
const sameOrigin = createSameOriginGuard({ origin: "https://app.example" });

export const createItem = (request: Request) =>
  withHttpRequest(request, () => Response.json({ created: true }, { status: 201 }), {
    route: "/api/items",
    guards: [sameOrigin, limit],
    observe: metrics.observe,
  });
```

Guards run in order before business work. Accepted guard headers survive later errors; a nested route policy's headers take precedence over an outer policy. `HttpError(code, errors?, { headers })` carries public response metadata while retaining the existing error JSON and request correlation. `HttpHeaders` is the native fetch header input type without requiring DOM type libraries. Guards and observers are optional, so applications enable them where needed. Avoid mounting the same limiter guard at both global and route boundaries unless both reservations are intended. Exempt probe and scrape routes at the composition root.

Metrics use only explicitly registered static labels, a fixed HTTP method set, bounded status codes and configured latency buckets. Unknown routes become `unmatched`; unknown methods become `UNKNOWN`. Nested `withHttpRequest` adapters can supply their static `route` label to the outer observer, which still runs once per request. Never use user IDs, raw URLs, query strings or request IDs as route labels. The collector accepts at most 100 labels and 30 increasing histogram boundaries. `metrics.exportPrometheus()` returns counter and cumulative histogram text; `metrics.response()` adds the appropriate content type and `no-store`. The application controls endpoint enablement, authentication and network exposure. These counters reset on process restart and describe completion of the HTTP handler, not streamed-body transfer duration.

The fixed-window limiter reserves quota synchronously, so concurrent handlers in one process cannot exceed the limit. Windows start at the first request for each key. Successful and blocked responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (Unix seconds); blocked responses add an integer `Retry-After` in seconds and return the shared `RATE_LIMITED` contract with HTTP 429. Active key storage is bounded by `maxKeys` (default 10,000); new keys fail closed when full, and expired entries are reclaimed without background timers. `clear()` resets local quotas.

Without a `key` resolver, all clients share one `anonymous` quota in that process. The library never reads `X-Forwarded-For`, `Forwarded`, cookies or arbitrary proxy headers. A trusted application adapter may resolve an authenticated identity or validated remote address; limit keys to 1–256 characters. Multiple replicas have independent quotas: replace the `RateLimiter` interface with an atomic shared implementation when a global budget is required. A fixed window permits bursts across a window boundary and is not a sliding-window policy.

Same-origin protection compares unsafe requests against a configured canonical HTTP(S) origin, independently of the internal request URL, Host or forwarding headers. GET, HEAD and OPTIONS are allowed. Other methods require an exact Origin; when Origin is absent, a same-origin Referer is accepted. Cross-site fetch metadata, opaque `null` origins, malformed source values, different ports/schemes and hostile Origin values are rejected with the fixed `FORBIDDEN` contract before side effects. An Origin cannot be rescued by a safe Referer. Missing source metadata is rejected by default. Use `allowMissingOrigin: true` only on separately authenticated non-browser endpoints such as a signed webhook, or omit the guard from that route; supplied hostile metadata is still denied. This guard complements authentication, secure cookies and endpoint-specific webhook verification.
