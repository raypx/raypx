# Raypx Code Examples

Examples below focus on current health check capability, using explicit package entrypoints.
AI calls, database, authentication, storage, and streaming sessions are not yet implemented, skeleton packages have no callable business interfaces.

## Contracts & Types

```ts
import { healthResponseSchema, type HealthResponse } from "@raypx/contracts/health";

const payload = {
  status: "ok",
  service: "raypx-api",
} satisfies HealthResponse;

const validated = healthResponseSchema.parse(payload);
```

`contracts` handles browser-usable contracts; `satisfies` checks static types, Zod validates runtime input.
When adding contracts, provide explicit exports in corresponding modules, do not put Node APIs, environment configuration, or request logic into contract layer.

## Start HTTP Routes

Web's server adapter references actual handler functions:

```ts
// web's .server.ts adapter module
export { healthResponse, apiNotFoundResponse } from "@raypx/api/health";
```

Start route only handles matching and binding HTTP handlers:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { healthResponse } from "../server/health.server";

export const Route = createFileRoute("/api/health")({
  server: { handlers: { GET: healthResponse } },
});
```

Existing `GET /api/health` returns `{ "status": "ok", "service": "raypx-api" }`.
Unknown APIs return JSON 404 via `apiNotFoundResponse`. Do not import these server entrypoints into browser components;
Start's import protection and engineering boundary checks jointly enforce runtime boundaries.

## Health Check HTTP Call

```ts
import { checkHealth } from "@raypx/api-client/health";

const controller = new AbortController();
const health = await checkHealth({ signal: controller.signal });
// Caller cancels incomplete check by calling controller.abort().
```

`checkHealth` calls same-origin `/api/health`, default 5 second timeout; adjustable via `timeoutMs`.
HTTP non-success status, network failure, timeout, cancellation, and invalid response contract all reject Promise, handled by caller.
Return value is Zod-validated `HealthResponse`.

## Page Assembly

New pages continue using Start file routing, assembled in web with components. UI package handles presentation, Hooks manage state,
HTTP requests handled by api-client, pages do not re-implement timeout, cancellation, and response validation.

```tsx
import { useHealthCheck } from "@raypx/hooks/health";
import { Button, ConnectionStatus } from "@raypx/ui";
import "@raypx/ui/styles.css";

function ConnectionPanel() {
  const { status, retry } = useHealthCheck();
  return (
    <section aria-labelledby="connection-heading">
      <h2 id="connection-heading">Service Connection</h2>
      <ConnectionStatus status={status} />
      <Button disabled={status === "loading"} onClick={retry}>
        Retry Connection
      </Button>
    </section>
  );
}
```

Hook state is `loading`, `connected`, or `error`; SSR maintains initial loading state, client effect makes request.
Retry cancels old check, component unmount cancels request; calling retry during loading does not duplicate request.
Base styles centrally loaded by root route, components need not re-import.

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <main>
      <h1>About Raypx</h1>
    </main>
  );
}
```

This is an example for adding new pages, current project has no `/about` page.
After adding routes, generate route tree through Start development or build, do not manually modify generated files.

## Testing Contracts & Server Responses

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

Tests directly importing server handlers should be placed in Node projects allowing server dependencies,
e.g., api package tests; browser-usable packages cannot add server dependencies for testing convenience.
Test API uses `vite-plus/test`, see [TESTING.md](TESTING.md) for specific commands, mocks, and coverage.

## TypeScript Build & Check Configuration

Static configuration provided by `@raypx/tsconfig`, task tools provided by `@raypx/config`.
Non-React runtime package `tsconfig.json`:

```json
{
  "extends": "@raypx/tsconfig/node.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

React packages extend `@raypx/tsconfig/react.json`, preserving JSX and DOM configuration.
`tsconfig.test.json` separately checks source, tests, and engineering configuration:

```json
{
  "extends": "@raypx/tsconfig/test.json",
  "compilerOptions": {
    "rootDir": "../.."
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

Runtime package type tasks execute `tsc --noEmit` and `tsc -p tsconfig.test.json` in sequence.
Test configuration here enables noEmit, cannot replace build configuration that generates ESM and declaration files.
`config` tool directly consumes TS, both configurations are noEmit, no initial build step added.

## Placement When Extending Capabilities

- Model calls and provider adapters in `ai`, server configuration in `env/server`.
- Database connection, Schema, and migrations in `db`; authentication and sessions in `auth`.
- File and object storage in `storage`, server logging in `logger`.
- Public interface logic in `api`, Start framework adaptation remains in web.
- Common response contracts in `contracts`, browser state and presentation in `hooks` and `ui` respectively.

Before implementing these capabilities, first determine actual product interfaces and providers, then add dependencies, configuration, and validation.
Only use actual public package entrypoints, do not directly import other package `src` or `dist`.
