# Reusable foundations

The template provides shared contracts, request boundaries, provider lifecycle,
database/auth infrastructure, validated cache helpers, async React hooks, and
shadcn components. Applications supply business rules and activate providers
explicitly.

## Database and accounts

The database package exports `createDatabase`, `runMigrations`, synchronous
`withTransaction`, and Better Auth's user/session/account/verification schema.
Bun uses native SQLite; Node uses better-sqlite3. A connection owns its close
and readiness checks. Async transaction callbacks are rejected because these
SQLite drivers commit synchronously.

Configure `apps/web/.env` with `DATABASE_PATH`, run `bun run db:migrate`, then
enable `AUTH_ENABLED` with `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`. The public
auth URL requires HTTPS in production. Startup checks configuration and the
migrated user table before accepting requests. The database participates in
readiness and shutdown only when accounts are enabled.

`/api/auth/*` exposes email/password signup, signin, signout, and the provider's
session endpoints. `/api/session` returns `{ user: null }` to anonymous callers.
`/api/me` demonstrates a protected read and returns 401 for anonymous callers.
These application projections omit session tokens and provider credentials.
Auth writes require the configured origin. Cookie-cache reads are disabled,
so revoking a database session invalidates the next request.

```typescript
import { signIn, signOut, getCurrentUser } from "@raypx/client/auth";

await signIn({ email, password });
const { user } = await getCurrentUser();
await signOut();
```

The browser client validates request and response contracts and preserves
typed HTTP failures. Writes are not automatically retried. When calling these
core functions directly, refresh session queries after signin/signout; the
React auth mutation hooks manage cache changes for their callers. Email verification,
recovery mail, OAuth, roles, and application authorization are extensions.

## Monitoring and request protection

`@raypx/api/metrics` provides process-local request counters and duration
histograms in Prometheus text format. The application's `/api/metrics` is
disabled by default. Enable `METRICS_ENABLED` and set a random `METRICS_TOKEN`,
then scrape with an `Authorization: Bearer <token>` header. Responses use
`Cache-Control: no-store`.

Metric labels use an explicit list of route templates. Unknown paths become
`unmatched`; raw URLs, query strings, request IDs, users, and credentials are
not labels. Add a static label at the application composition root when adding
an endpoint. Nitro and SSR share one metrics/resource instance in a process.
External collection, dashboards, alerting, and tracing exporters can be
attached to the existing observation boundary.

`@raypx/api/security` exposes fixed-window `createRateLimiter`,
`createRateLimitGuard`, and `createSameOriginGuard`. The web template defaults
to a shared anonymous quota of 120 API requests per minute, configured with
`API_RATE_LIMIT_MAX` and `API_RATE_LIMIT_WINDOW_MS`. Liveness, readiness, and
the authenticated metrics endpoint are exempt. Limit responses carry the
shared 429 contract, correlation ID, quota headers, and `Retry-After`.

The shared anonymous quota is a process-level resource guard. For per-user
quotas, inject a trusted session identity resolver. Proxy headers are not a
trusted identity by default. Multiple replicas require a shared limiter
implementation. Same-origin guards compare configured origins and reject
missing browser origin metadata on writes unless a route explicitly opts out.

## Client React queries and UI behavior

The examples below use shared asynchronous primitives inside application
features. Product-specific hooks default to
`apps/web/src/features/<feature>/hooks`, colocated with their contracts and
validated browser clients. Promote them to `client/react` only after real
cross-application reuse, stable contracts, browser safety, and clear framework
adaptation, with public exports, documentation, and tests. Component behavior
belongs in `ui/hooks`; product stores and Start composition stay in web.
See [placement and references](../ARCHITECTURE.md#feature-placement-and-promotion).

```tsx
import { useAsyncResource, useMutation } from "@raypx/client/react";

const account = useAsyncResource({
  key: accountId,
  load: (signal) => loadAccount(accountId, signal),
});
const save = useMutation({ execute: (input: AccountInput, signal) => saveAccount(input, signal) });
const result = await save.mutate(input);
if (result.status === "error") showError(result.error);
```

Resource keys define identity. New keys clear old data; same-key retries retain
previous successful data while revalidating. Updating an inline loader alone
does not trigger a request. Consumers may cancel, retry, or disable a resource.
Requests run in effects, so SSR does not perform browser fetches.

The generic `useAsyncResource` and `useMutation` helpers own component state.
Mutations return explicit success/error/cancelled outcomes. Only the latest
operation updates visible state. Cancellation, unmount, and Strict Mode
cleanup prevent late results from replacing newer state.

`useSession` and `useHealthCheck` use TanStack Query to share requests and cache
within the caller's QueryClient. `createQueryClient` and `ClientProvider` are
framework-independent exports. Create one client per SSR request/router, then
retain the browser router's client through navigation. Start's SSR integration
belongs in `apps/web`; never put a shared server QueryClient at module scope.
SSR prefetching requires a request-aware query function instead of the default
browser-relative HTTP function. `accountQueryKey(accountId, ...resource)` puts
account identity into private query keys. Auth mutation hooks cancel and remove
private account queries and synchronize session state after successful writes.

The `@raypx/client` root and HTTP subpaths remain free of React; only its
`/react` entrypoint exposes these hooks. The client depends on `contracts`,
while UI has no business workspace dependencies. Component behavior such as
`useDebouncedValue` lives in `@raypx/ui/hooks` and cleans up its own timer.
The former `@raypx/api-client` and `@raypx/hooks` workspaces are removed.

## Feature cache

```typescript
import { createCache } from "@raypx/storage/cache";
import { sessionUserSchema } from "@raypx/contracts/auth";

const accountCache = createCache({ storage, namespace: "accounts", schema: sessionUserSchema });
const account = await accountCache.getOrSet(accountId, 60, () => loadAccount(accountId));
await accountCache.invalidate(accountId);
```

Each namespace owns its keys. Reads and fresh results are schema validated.
Concurrent misses for a key share one loader within an instance. Invalidation
prevents pending loads or already-started writes from leaving stale cache
entries. Storage failures allow fresh validated results; loader failures are
returned to the caller. A failed invalidation/clear bypasses this cache
instance until it is recreated. Register the active storage disposer with the runtime
lifecycle. Cross-process locks and shared cache coordination remain application
choices.

## UI and checks

`@raypx/ui` has 29 components. The new reusable primitives are Card, Table,
Tabs, Tooltip, DropdownMenu, Popover, Avatar, Pagination, and Accordion. They
share the existing semantic tokens, theme, focus treatment, portal layers, and
reduced-motion support. Storybook provides 118 examples with docs, controls,
interaction tests, and accessibility checks.

```sh
bun run storybook
bun run check
bun run storybook:install
bun run storybook:test
```

CI runs the complete workspace check, installs Chromium, and executes all
Storybook browser tests. Adding a feature should include a contract, server
handler, validated client, and query hooks within the application feature when
needed. Promote public data capabilities after the reuse conditions above are
met. Reusable UI states and component behavior hooks belong in `ui` and `ui/hooks`.
Activate its resources explicitly and register readiness/disposal at the
composition root. See each package's README for the concrete API.
