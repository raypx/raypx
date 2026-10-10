# Raypx Code Examples

These examples use current public entrypoints. HTTP functions live in the
React-free client core, business queries in `client/react`, and component
behavior in `ui/hooks`. The old `api-client` and independent `hooks` workspaces
have been removed without aliases.

## Contracts and Server Routes

```ts
import { healthResponseSchema, type HealthResponse } from "@raypx/contracts/health";

const payload = {
  status: "ok",
  service: "raypx-api",
} satisfies HealthResponse;

const validated = healthResponseSchema.parse(payload);
```

Contracts contain browser-safe schemas and inferred types. Server handlers
live in API, exposed through web `.server.ts` adapters and Start routes:

```ts
// apps/web/src/server/health.server.ts
export { healthResponse, apiNotFoundResponse } from "@raypx/api/health";
```

```ts
import { createFileRoute } from "@tanstack/react-router";
import { healthResponse } from "../server/health.server";

export const Route = createFileRoute("/api/health")({
  server: { handlers: { GET: healthResponse } },
});
```

Do not import server entrypoints into browser components. Start's import
protection and the AST boundary checker enforce this separation.

## HTTP Without React

```ts
import { checkHealth } from "@raypx/client/health";
import { getSession } from "@raypx/client/session";

const controller = new AbortController();
const health = await checkHealth({ signal: controller.signal });
const { user } = await getSession();
// controller.abort() cancels an unfinished request.
```

The client validates successful responses and reports typed HTTP, validation,
timeout, cancellation, and network failures. Requests default to a five-second
deadline. GET/HEAD retries are opt-in; auth writes are never retried.
HTTP entrypoints and the client root do not import React or TanStack Query.

## React Query and Page Assembly

```tsx
import { useHealthCheck, useSession } from "@raypx/client/react";
import { Button, ConnectionStatus } from "@raypx/ui";

function ConnectionPanel() {
  const { status, retry } = useHealthCheck();
  const session = useSession();
  return (
    <section aria-labelledby="connection-heading">
      <h2 id="connection-heading">Service Connection</h2>
      <ConnectionStatus status={status} />
      <Button disabled={status === "loading"} onClick={retry}>
        Retry
      </Button>
      <p>{session.data?.user?.name ?? "Guest"}</p>
    </section>
  );
}
```

The application supplies a QueryClient. Health and session consumers share
requests and cache within that client. `useHealthCheck` returns `loading`,
`connected`, or `error`; `useSession` exposes its public account projection,
status, error, retry, and cancellation. UI renders these states without fetching
business data or reading server configuration. Root web styles are loaded once.

For a React application without Start, supply the generic provider:

```tsx
import { useState } from "react";
import { ClientProvider, createQueryClient } from "@raypx/client/react";

function StandalonePanel() {
  const [client] = useState(() => createQueryClient());
  return (
    <ClientProvider client={client}>
      <ConnectionPanel />
    </ClientProvider>
  );
}
```

Start's SSR query integration belongs in `apps/web`. Create a separate client
for every router/server request and retain the browser router's client through
navigation; never share a server cache at module scope. SSR prefetches must use
request-aware query functions because the default browser-relative transport
cannot forward incoming server request cookies.

Use `accountQueryKey(accountId, ...resource)` for private business query keys.
Auth mutation hooks cancel and remove account-private queries and synchronize
session state after successful writes. Do not put passwords, tokens, or cookies
in query keys.

## Component Behavior

```tsx
import { useState } from "react";
import { Input } from "@raypx/ui";
import { useDebouncedValue } from "@raypx/ui/hooks";

function SearchInput() {
  const [value, setValue] = useState("");
  const debounced = useDebouncedValue(value, 300);
  return (
    <section aria-label="Search preview">
      <Input aria-label="Search" value={value} onChange={(event) => setValue(event.target.value)} />
      <output aria-live="polite">{debounced}</output>
    </section>
  );
}
```

UI hooks own behavior and cleanup. They do not depend on business contracts,
clients, routing, or session state. Business requests belong in `client/react`.

## Testing and TypeScript Configuration

```ts
import { expect, test } from "vite-plus/test";
import { healthResponseSchema } from "@raypx/contracts/health";
import { healthResponse } from "@raypx/api/health";

test("health response follows the contract", async () => {
  const response = healthResponse();
  expect(response.status).toBe(200);
  expect(healthResponseSchema.parse(await response.json())).toEqual({
    status: "ok",
    service: "raypx-api",
  });
});
```

Place server-handler tests in Node projects with allowed server dependencies.
React hook tests use a fresh QueryClient/provider and controlled fetches; verify
cache sharing, cancellation, auth transitions, and independent SSR clients.
See [TESTING.md](TESTING.md).

Shared presets come from the config package:

```json
{
  "extends": "@raypx/config/tsconfig/node.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

React packages extend `@raypx/config/tsconfig/react.json`.
`tsconfig.test.json` extends `@raypx/config/tsconfig/test.json` and separately
checks source, tests, and Vite configuration with `noEmit`. Runtime packages
build ESM and declarations; engineering tools use direct TypeScript exports.

## Placement When Extending Capabilities

- Public schemas in `contracts`; validated HTTP functions in `client`.
- Business queries and mutations in `client/react`; component behavior in `ui/hooks`.
- Server logic in `api`, auth in `auth`, schema/migrations in `db`, and caches in `storage`.
- Start routes, request-aware SSR integration, provider activation, and deployment in web.
- Runtime configuration in `env/server`; logging in `logger`; engineering tools in `config`.

Use declared public exports and run `bun run check:boundaries` after changing
imports. See [Reusable foundations](docs/FOUNDATIONS.md) for database, auth,
metrics, security, and cache APIs.
