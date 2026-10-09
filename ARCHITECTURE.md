# Raypx Architecture

TanStack Start in `apps/web` is the application's entrypoint for file routing,
SSR, and HTTP. Nitro emits the Bun production server. Bun manages workspaces
and runtime execution; Vite+ manages tasks, tests, lint, formatting, and local
cache. Runtime packages compile to ESM and declarations with strict TypeScript.

## Responsibilities and Boundaries

| Package      | Responsibility                                                                | Boundary               |
| ------------ | ----------------------------------------------------------------------------- | ---------------------- |
| `web`        | Routing, pages, framework adapters, initialization, and deployment            | Full stack             |
| `contracts`  | Zod health, readiness, and API error contracts                                | Browser and server     |
| `api-client` | JSON requests, response validation, typed failures, timeout, and cancellation | Browser-safe           |
| `hooks`      | Connection check state and lifecycle                                          | React                  |
| `ui`         | Presentation components and styles                                            | React                  |
| `api`        | HTTP context and errors, probes, registered resource lifecycle                | Server                 |
| `env`        | Runtime parsing with separate client/server exports                           | Isolated by entrypoint |
| `logger`     | evlog output, asynchronous context, and redaction                             | Server                 |
| `db`         | Lazy SQLite and Drizzle access, connection close                              | Server                 |
| `auth`       | Better Auth initialization and session helpers                                | Server                 |
| `storage`    | unstorage cache and driver helpers                                            | Server                 |
| `worker`     | In-process execution and cooperative cancellation                             | Server                 |
| `config`     | Tasks, import boundaries, aliases, styles, and JSON TypeScript presets        | Engineering            |

```text
web pages → hooks → api-client → contracts
          → ui
web server adapters → api → contracts / logger
web runtime initialization → env/server / logger / api/runtime
auth → db / logger
db / storage / worker → logger
```

The boundary checker permits additional server dependencies when a feature
actually needs them; add each workspace dependency explicitly. Runtime code
cannot import engineering tools from `config`. Browser packages cannot import
server packages, Node/Bun built-ins, or `env/server`. Public configuration in
`env/client` has no fields yet. There is no mixed env root export.

Package imports must use declared public exports, never another package's
`src` or `dist`. Dependencies cannot point from packages to `web` or form
cycles. Start import protection checks the client graph; the TypeScript AST
checker validates declarations and source imports through
`bun run check:boundaries`. Both run during the full project check.

## Runtime Initialization and Requests

`apps/web/src/server/runtime.server.ts` calls `loadServerEnv`, normalizes
`NITRO_HOST` and `NITRO_PORT`, configures logging, and creates the lifecycle.
The Nitro plugin loads it before creating the listener. Importing the env
package alone does not read configuration or require provider credentials.
Application parsing is independent of `check:env` toolchain version checks.

The Nitro plugin wraps request handling with `withHttpRequest`. Each request
gets an isolated asynchronous context containing its ID, method, path, and
logger; accepted request IDs are returned as `x-request-id`. Nested server
adapters reuse this context and catch deliberate `HttpError` failures before
framework fallback handling. Unexpected failures receive safe public errors,
while details stay in redacted server logs. Completion logs include status and
duration. An optional observation callback can feed a metrics sink without
changing the HTTP response when that sink fails.

Contracts define response shapes. API logic lives in `api`; web `.server.ts`
adapters and Start routes expose it. Browser callers use `api-client` to
validate successful payloads and distinguish HTTP, validation, timeout, abort,
and network failures. Hooks manage loading, retry, and cancellation; UI renders
that state without reading server configuration.

## Probes and Resource Lifecycle

`/api/health` reports process liveness without accessing providers. `/api/ready`
reports initialization and registered resource checks, returning 503 before
readiness, during draining, or when a required check fails. Optional checks may
fail without making the service unavailable. The current application registers
no database, authentication, storage, or model resource.

`RuntimeLifecycle` tracks only resources explicitly created and registered by
the application. Register a provider check and disposer when its feature is
activated; do not connect unused providers merely to answer a probe. Checks
have a timeout. Shutdown marks the runtime draining, disposes resources in
reverse registration order once, and uses one total deadline. Nitro owns
signal-driven server close; the plugin marks readiness unavailable on SIGTERM
and SIGINT and releases resources from the close hook.

`getDatabase()` lazily opens a real better-sqlite3 connection and enables WAL
and foreign keys; `closeDatabase()` closes it. Database paths are explicit
function parameters, not part of the env schema. The auth module currently
calls `getDatabase()` during import. Web does not import this module or expose
auth routes. Importing auth therefore activates its database dependency and
must be an intentional feature decision.

## Engineering and Extension

Shared static presets are exported from `@raypx/config/tsconfig/*.json`.
`@raypx/config/tsconfig-presets/*.json` is a compatibility path to the same
files. They are not a separate active workspace. Engineering tools expose `.ts`
entrypoints and use native TypeScript execution; tsc still checks their types.
Runtime `tsconfig.json` produces artifacts; `tsconfig.test.json` checks source,
tests, and Vite configuration without emitting files.

Package builds follow workspace dependency order. Development first compiles
runtime packages, then starts watchers and Start. Build, type check, and test
caches include transitive source and configuration; startup and watching are
not cached. The project has no separate API process or remote build cache.

New HTTP endpoints should add a contract, server handler, web adapter and route,
and a browser client when needed. Use the shared request boundary and validated
JSON helper. When adding provider configuration, update the env schema, its
consumer, examples, and tests together. SQLite, Better Auth, unstorage, and
evlog are already selected packages; application schemas, migrations, login
routes, model integrations, and external monitoring backends are not complete
product capabilities.
