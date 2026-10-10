# @raypx/client

Browser-safe client SDK with separate core and React entrypoints. Workspace runtime dependencies are limited to `@raypx/contracts`. The core entrypoint imports no React, Query, application routes, or server implementations.

Core entrypoints are `@raypx/client/health`, `/http`, `/errors`, `/session`, and `/auth`. The root entrypoint reexports these APIs. React APIs are available separately from `@raypx/client/react`.

## Where New Capabilities Belong

Product-specific data hooks default to `apps/web/src/features/<feature>/hooks`.
Colocate their contracts, validated browser clients, and `.server.ts` handlers
within that feature, and reuse `requestJson` and the application's QueryClient.
Product routes, permission decisions, navigation, and workflow state stay in
the application. Component behavior such as debounce, focus, or measurement
belongs in `@raypx/ui/hooks`.

Promote a data capability into this package only after real reuse across
applications or independent consumers establishes a stable API. Require
validated contracts, browser-safe transport, explicit React/framework adapters,
meaningful tests, documentation, and public exports. Several consumers within
one application feature can remain feature-local. A promoted capability must
work without its original product's application store, routes, server
configuration, or a global SSR cache.

Shared HTTP functions belong in the React-free core and use `@raypx/contracts`
for their public contracts. Shared data hooks belong in `src/react` and are
exported through `@raypx/client/react` or an explicitly declared React subpath.
Add exports deliberately; consumers must not import `src` or `dist`. Keep Start
providers, routing, SSR integration, and request-aware prefetching in web.
The client provides reusable data APIs rather than an application store.

The [architecture references](../../ARCHITECTURE.md#references-for-these-boundaries)
explain the shadcn UI ownership, LobeHub transport/data/component separation,
and TanStack core/framework-adapter boundary used here. Raypx keeps its existing
TanStack Query implementation and uses subpath entrypoints within one client
package at its current scale.

## HTTP Core

```typescript
import { checkHealth } from "@raypx/client/health";
import { requestJson } from "@raypx/client/http";
import { healthResponseSchema } from "@raypx/contracts/health";

const controller = new AbortController();
const health = await checkHealth({ signal: controller.signal, timeoutMs: 5000 });
const retriedHealth = await requestJson({
  path: "/api/health",
  schema: healthResponseSchema,
  signal: controller.signal,
  retry: { maxRetries: 2, delayMs: 100 },
});
```

`requestJson({ path, schema, method?, body?, headers?, signal?, timeoutMs?, retry? })` requires an absolute same-origin path beginning with a single `/`. It sets `mode` and `credentials` to `same-origin`, requests JSON, and validates the response using the supplied `parse(unknown)` schema. JSON request bodies reject cycles, non-finite numbers, and non-JSON objects. GET and HEAD cannot contain bodies. HEAD passes `undefined` to the response schema because HTTP HEAD has no response body.

The default 5000 ms timeout covers the complete operation, including response reading and retry delays. Caller cancellation is preserved. Retry is disabled by default; explicit retries are limited to GET/HEAD, at most three retries and a delay of 0–1000 ms. Only network failures and HTTP 408, 429, 500, 502, 503, and 504 are retried. Invalid response contracts, cancellation, and timeouts are never retried. Writes cannot opt into retries.

```typescript
import { ApiClientError } from "@raypx/client/errors";

try {
  await checkHealth();
} catch (error) {
  if (error instanceof ApiClientError) {
    console.info(error.kind, error.code, error.status, error.requestId);
  }
}
```

`ApiClientError.kind` is `http`, `network`, `timeout`, `aborted`, `invalid-request`, or `invalid-response`. Valid server errors preserve their public `code`, `message`, field `errors`, and `requestId`; the `x-request-id` header is a fallback. Raw response bodies are never used as error messages. Non-JSON bodies, malformed JSON, and invalid success/error schemas are rejected. HEAD failures use the HTTP status and request ID header without requiring an error body. Timeout and cancellation errors retain the names `TimeoutError` and `AbortError`, with the original reason in `cause`.

The health helper keeps its existing `signal` and `timeoutMs` options and uses the shared transport. Readiness probes have a dedicated response contract, including HTTP 503, and should be consumed by infrastructure probes rather than this business JSON transport.

For a product endpoint, begin with feature-local schemas, handlers, and a client
calling `requestJson`. Once the promotion conditions above are met, move its
shared contracts to `contracts`, reusable server logic to the appropriate server
package, and public transport/React adapters into this package. UI components
receive data and callbacks; the `/react` entrypoint manages reusable query state
and request lifecycle.

## Accounts

`@raypx/client/session` exports `getSession`, which reads `/api/session`
and validates a public user projection or anonymous null.
`@raypx/client/auth` exports `signUp`, `signIn`, `signOut`, and
`getCurrentUser`. Auth writes validate their input and do not retry. Successful
responses strip provider/session credentials; `/api/me` returns a typed 401
when anonymous. All helpers accept an optional AbortSignal. Core methods do not manage a Query cache. Use the React auth mutation hooks to synchronize mounted session consumers after changing account state. Endpoints
require application authentication activation as documented in ENV.md.

## React client

Install the optional React peers when using `@raypx/client/react`: React
19.3.0 and `@tanstack/react-query` ^5.104.1. Core consumers need neither peer.
The React entry exports `createQueryClient`, `ClientProvider`, query options,
`useSession`, `useHealthCheck`, and account mutations. It also exposes Query's
`queryOptions`, `useQuery`, and `useQueryClient` for application queries.

```tsx
import { ClientProvider, createQueryClient } from "@raypx/client/react";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createQueryClient());
  return <ClientProvider client={client}>{children}</ClientProvider>;
}
```

Create one QueryClient per SSR request/router and retain that router's client
through browser navigation. `apps/web/src/router.tsx` integrates Start's SSR
adapter, which supplies its own QueryClientProvider and manages dehydration,
hydration, and streaming; it does not need a second `ClientProvider` wrapper.
The generic client package does not depend on Start or its server APIs.

`createQueryClient(config?)` defaults to 30 seconds of freshness and disables
query/mutation retries; applications may override defaults for their own
queries. The built-in session, health and auth operations keep retries disabled.
The JSON transport continues to support explicit read retries independently.

`sessionQueryOptions(scope?)` and `healthQueryOptions()` share typed keys and
HTTP functions. Multiple consumers share pending requests and successful data.
Both use Query's AbortSignal. Their default HTTP functions use browser-relative
URLs: SSR loaders must supply a request-aware queryFn before prefetching.
Ordinary hooks do not send an HTTP request during SSR.

`useSession({ enabled?, key? })` returns `status`, `data`, `error`, `retry`, and
`cancel`; anonymous `{ user: null }` is a successful result. A disabled consumer
immediately hides its projection. Changing `key` selects a different query
scope. Cancel pauses that consumer; the shared pending request is aborted only when
no enabled consumers remain. Retry resumes it or joins an existing shared read. `useHealthCheck()` returns `loading` / `connected` / `error`
and `retry`, preserving the application's connection UI.

## Account mutations and private queries

`useSignIn()`, `useSignUp()`, and `useSignOut()` return TanStack mutation
results. `mutateAsync` rejects on a write failure; `isPending` and `isError`
support form feedback. Auth writes never retry and share one mutation scope,
so cookie-changing operations execute serially within a QueryClient.

After a confirmed write, these hooks cancel pending session/private reads,
clear private cache and mounted observer data, and synchronize session scopes.
Signin uses its confirmed public user; signup re-reads the real session because
verification settings may leave the new account anonymous. If that read fails,
account creation remains successful and all existing session scopes receive a
retryable read error with a safe anonymous projection. A successful scoped retry
synchronizes the other session scopes as well.
Signout publishes `{ user: null }`.

Private queries must use `accountQueryKey` with the **current session user ID**,
be disabled while anonymous, and stop rendering private content while anonymous.
Avoid carrying a previous account's data through `initialData` or
`placeholderData` after an identity change.

```tsx
import { getCurrentUser } from "@raypx/client/auth";
import { accountQueryKey, useQuery, useSession } from "@raypx/client/react";

export function AccountName() {
  const session = useSession();
  const user = session.data?.user;
  const account = useQuery({
    queryKey: accountQueryKey(user?.id ?? "anonymous", "me"),
    queryFn: ({ signal }) => getCurrentUser({ signal }),
    enabled: Boolean(user),
  });
  if (!user) return null;
  return <span>{account.data?.user.name ?? user.name}</span>;
}
```

Cache synchronization does not refresh Router-owned loader data or route context.
Applications using auth in route guards should also call `router.invalidate()`
after success. Server authorization remains required for every private read and
write; a query key does not grant permission.

## Lower-level asynchronous tools

`useAsyncResource({ key, load(signal), enabled? })` and
`useMutation({ execute(input, signal) })` remain available from
`@raypx/client/react` or its `/resource` and `/mutation` subpaths. They own
component state rather than a Query cache. Use them for isolated asynchronous
work and use Query for server data shared across components or routes.
Resources cancel superseded loads; mutations resolve explicit
success/error/cancelled outcomes. Inspect the outcome before showing success.
Cancellation cannot undo a server write that has already been accepted.

## Package migration

- `@raypx/api-client` and its core subpaths become `@raypx/client`.
- Business/data hooks from `@raypx/hooks` become `@raypx/client/react`.
- `useDebouncedValue` moves to `@raypx/ui/hooks` or `/hooks/debounce`.

The old workspace packages are removed. The core root does not reexport React
hooks. UI hooks handle component behavior and have no business/client dependency.
