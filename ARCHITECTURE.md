# Raypx Architecture

TanStack Start in `apps/web` is the application's entrypoint for file routing,
SSR, and HTTP. Nitro emits the Bun production server. Bun manages workspaces
and runtime execution; Vite+ manages tasks, tests, lint, formatting, and local
cache. Runtime packages compile to ESM and declarations with strict TypeScript.

## Responsibilities and Boundaries

| Package     | Responsibility                                                         | Boundary               |
| ----------- | ---------------------------------------------------------------------- | ---------------------- |
| `web`       | Routing, pages, framework adapters, initialization, and deployment     | Full stack             |
| `contracts` | Zod health, readiness, and API error contracts                         | Browser and server     |
| `client`    | Validated HTTP core; separate React query and mutation adapters        | Browser-safe           |
| `ui`        | Presentation components, styles, and component behavior hooks          | React                  |
| `api`       | HTTP context and errors, probes, registered resource lifecycle         | Server                 |
| `env`       | Runtime parsing with separate client/server exports                    | Isolated by entrypoint |
| `logger`    | evlog output, asynchronous context, and redaction                      | Server                 |
| `db`        | Lazy SQLite and Drizzle access, connection close                       | Server                 |
| `auth`      | Better Auth initialization and session helpers                         | Server                 |
| `storage`   | unstorage cache and driver helpers                                     | Server                 |
| `worker`    | In-process execution and cooperative cancellation                      | Server                 |
| `config`    | Tasks, import boundaries, aliases, styles, and JSON TypeScript presets | Engineering            |

```text
web pages → client/react → client core → contracts
          → ui / ui/hooks
web server adapters → api → contracts / logger
web runtime initialization → env/server / logger / api/runtime
auth → db / logger
db / storage / worker → logger
```

The only business workspace dependency of `client` is `contracts`; `ui` has none.
`@raypx/client` and its HTTP subpaths have no React dependency in their source graph.
React and TanStack Query are isolated in `@raypx/client/react`. Public data hooks
there must be reusable across applications. Product-specific hooks default to
`apps/web/src/features/<feature>/hooks`. UI hooks such as
debounce belong to `@raypx/ui/hooks` and do not fetch business data. The former
`api-client` and `hooks` workspaces have been removed; their imports have no aliases.
See the [client package guide](packages/client/README.md) for the migration table.

The boundary checker permits additional server dependencies when a feature
actually needs them; add each workspace dependency explicitly. Runtime code
cannot import engineering tools from `config`. Browser packages cannot import
server packages, Node/Bun built-ins, or `env/server`. Public configuration in
`env/client` has no fields yet. There is no mixed env root export.

Package imports must use declared public exports, never another package's
`src` or `dist`. Dependencies cannot point from packages to `web` or form
cycles. Start import protection checks the client graph; the TypeScript AST
checker validates declarations and source imports through
`bun run check:boundaries`. It also prevents core imports or reexports of the
React adapter and keeps Start dependencies out of the universal client. Both
checks run during the full project check.

`apps/web` owns Start's query integration and creates a QueryClient for each
router instance. Server requests never share a module-level query cache;
browser navigation retains its router's cache. Generic `ClientProvider` and
`createQueryClient` exports remain independent of Start. SSR prefetching must
provide a request-aware query function; browser-relative fetches cannot forward
server request cookies by themselves.

## Feature Placement and Promotion

Start product features in `apps/web/src/features/<feature>/`: colocate their
contracts, validated browser clients, server implementations marked `.server.ts`,
and hooks. Start routes bind these application handlers. Feature hooks compose
the shared transport and Query adapters while keeping product permissions,
navigation, workflow state, and cache policy in the application.

| Capability                                                   | Default owner                           | Consumer entrypoint                                |
| ------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------- |
| Component behavior such as debounce, focus, or measurement   | `packages/ui/src/hooks`                 | `@raypx/ui/hooks`                                  |
| Product-specific data or workflow hooks                      | `apps/web/src/features/<feature>/hooks` | Feature-local imports                              |
| Shared browser-safe HTTP capability                          | `packages/client/src`                   | `@raypx/client` or an explicit HTTP subpath        |
| Shared data capability with a React adapter                  | `packages/client/src/react`             | `@raypx/client/react` or an explicit React subpath |
| Start routing, providers, SSR, and request-aware prefetching | `apps/web`                              | Application composition                            |

Promote a feature capability only after actual reuse across applications or
independent consumers establishes a shared API. It needs stable validated
contracts, browser-safe transport, an explicit framework adapter, meaningful
tests, documentation, and public package exports. Consumers must not need the
original product's routes, application store, server configuration, or a shared
server QueryClient. Reuse by several components in one feature can remain
feature-local. Use shared contracts and transport after promotion, while product
composition stays in web. The client must remain a reusable data boundary rather
than accumulate an application store.

### References for These Boundaries

- [shadcn monorepo guidance](https://ui.shadcn.com/docs/monorepo) places reusable
  UI components, utilities, and hooks in a shared UI package with explicit aliases.
  Raypx follows that ownership while retaining its new-york/Radix registry.
- [Lobe UI hooks](https://github.com/lobehub/lobe-ui/tree/master/src/hooks), such
  as copy, text overflow, and native button behavior, illustrate hooks owned by
  the component layer rather than an application's data layer.
- [LobeHub data-fetching architecture](https://github.com/lobehub/lobehub/blob/canary/.agents/skills/data-fetching-architecture/SKILL.md)
  separates transport services, data/state adapters, and components. Raypx uses
  its existing TanStack Query implementation and application feature hooks to
  preserve those responsibilities; product stores stay in the application.
- [TanStack React Query's manifest](https://github.com/TanStack/query/blob/main/packages/react-query/package.json)
  shows a framework adapter depending on query-core with React as a peer.
  Raypx applies the core/adapter distinction through public subpath exports and
  optional React peers within one client package. Separate workspace packages
  can wait for independent consumers, framework support, or release needs.

## Runtime Initialization and Requests

`apps/web/src/server/runtime.server.ts` calls `loadServerEnv`, normalizes
`NITRO_HOST` and `NITRO_PORT`, configures logging, and creates the lifecycle.
The Nitro plugin loads it before creating the listener. Importing the env
package alone does not read configuration or require provider credentials.
Application parsing is independent of `check:env` toolchain version checks.

The Nitro plugin wraps request handling with `withHttpRequest`. Each request
gets an isolated asynchronous context containing its ID, method, path, and
logger and cancellation signal; accepted request IDs are returned as `x-request-id`. Nested server
adapters reuse this context and catch deliberate `HttpError` failures before
framework fallback handling. Unexpected failures receive safe public errors,
while details stay in redacted server logs. Completion logs include status and
duration. The existing observation callback records response-ready latency;
an additive lifecycle callback records application response stream completion,
failure, or cancellation. Streaming retains backpressure and the originating
request/log context; observer failures cannot change HTTP behavior.

Bounded raw-body and JSON readers count actual bytes and enforce a read deadline.
JSON parsing also validates the media type. Applications supply their body policy;
the shared API package never reads env. The auth adapter checks origin, reads bounded
raw bytes, and passes them to Better Auth without a second transport read. Listener
limits remain a separate coarse runtime safeguard, and shared JSON limits do not
implicitly limit every SSR or future upload endpoint.

Shared contracts define reusable response shapes, and `api` provides common
server boundaries. Product contracts and handlers stay in application features;
web `.server.ts` adapters and Start routes expose them. Browser callers use `client` to
validate successful payloads and distinguish HTTP, validation, timeout, abort,
and network failures. `client/react` adds shared query state and auth mutations;
account-private keys include their account identity and are cleared when auth
changes. UI renders that state without reading server configuration.

## Probes and Resource Lifecycle

`/api/health` reports process liveness without accessing providers. `/api/ready`
reports initialization and registered resource checks, returning 503 before
readiness, during draining, or when a required check fails. Optional checks may
fail without making the service unavailable. When `AUTH_ENABLED=true`, the application creates its database and auth
instance, then registers database readiness and disposal. Disabled providers
are not created.

`RuntimeLifecycle` tracks only resources explicitly created and registered by
the application. Register a provider check and disposer when its feature is
activated; do not connect unused providers merely to answer a probe. Checks
have a timeout. Shutdown marks the runtime draining, disposes resources in
reverse registration order once, and uses one total deadline. Nitro owns
signal-driven server close; the plugin marks readiness unavailable on SIGTERM
and SIGINT and releases resources from the close hook.

`createDatabase()` owns an isolated SQLite connection. Bun uses its native
SQLite driver; Node uses better-sqlite3. Schema and synchronous transactions
are shared. `getDatabase()` is a lazy compatibility singleton. Auth tables and
SQL migrations are public package assets. Run `bun run db:migrate` as an
explicit deployment step before activating authentication.

`createAuth()` accepts a migrated database, secret, and public origin. Imports
do not open a database. The application serves Better Auth under `/api/auth/*`,
an anonymous-capable public account projection at `/api/session`, and a
protected example at `/api/me`. Cookie caching is disabled so database session
revocation takes effect immediately. Email verification and email delivery
remain application extensions.

The request boundary collects process-local HTTP counters and duration
histograms, using closed sets of route/method/status labels. The opt-in
`/api/metrics` endpoint requires a bearer token. API requests use a configurable
process-local shared anonymous quota; probes and metrics are exempt. A trusted
identity resolver or shared limiter can be supplied for user-specific or
replicated deployments. Arbitrary forwarding headers are not trusted. Auth
writes require the configured same origin.

## Engineering and Extension

Shared static presets are exported from `@raypx/config/tsconfig/*.json`.
`@raypx/config/tsconfig-presets/*.json` is a compatibility path to the same
files. They are not a separate active workspace. Engineering tools expose `.ts`
entrypoints and use native TypeScript execution; tsc still checks their types.
The root doctor combines tool checks with source-first application configuration
diagnostics. Database and HTTP checks are explicit, read-only probes; it does not
initialize the web runtime, enable providers, or apply migrations.
`scripts/bin/raypx.ts` is the repository CLI, run with Bun; existing root command names delegate to its
subcommands. It dispatches bootstrap commands before importing the installed
citty registry in `scripts/cli.ts`. Installed command definitions belong in
`scripts/commands`, with diagnostic and consumer logic in `scripts/lib`.
citty supplies help and options, and consola supplies phase summaries. Both are
root development dependencies. Environment checks, setup,
and doctor keep dependency-free bootstrap paths and native Bun env loading;
doctor's machine-readable reports do not pass through the shared logger.
Doctor and consumer regression tests belong to the independent `scripts` test
project; `packages/config` owns reusable engineering tools and static presets.
`scripts/tsconfig.json` checks the bin, root tools, tests, and consumer browser configuration.
Runtime `tsconfig.json` produces artifacts; `tsconfig.test.json` checks source,
tests, and Vite configuration without emitting files.

Package builds follow workspace dependency order. Development first compiles
runtime packages, then starts watchers and Start. Build, type check, and test
caches include transitive source and configuration; startup and watching are
not cached. The project has no separate API process or remote build cache.

Root commands are the authoritative engineering interface. Knip checks unused
files and dependencies using public exports and explicit dynamic entrypoints.
Application browser tests exercise dev and built servers. Separate consumers
install public build outputs outside the repository, validating ESM, declarations,
CSS, migrations, and browser boundaries without source aliases.

These additions follow the inspected vinext implementation's
[bounded text reader](https://github.com/cloudflare/vinext/blob/main/packages/vinext/src/utils/text-stream.ts),
[stream execution boundary](https://github.com/cloudflare/vinext/blob/main/packages/vinext/src/server/app-route-handler-execution.ts),
and [export-derived Knip configuration](https://github.com/cloudflare/vinext/blob/main/knip.ts).
Raypx applies the patterns at its existing Nitro and package boundaries.

The scripts structure also follows vinext's
[thin integration command](https://github.com/cloudflare/vinext/blob/main/scripts/ci-integration-shard.mjs),
[extracted planning logic](https://github.com/cloudflare/vinext/blob/main/scripts/lib/integration-shard-plan.mjs),
and [explicit script test registration](https://github.com/cloudflare/vinext/blob/main/vite.config.ts).
Raypx retains Bun entrypoints, separates Node unit tests from browser acceptance,
and uses its existing temporary fixture and bounded process cleanup behavior.
See [scripts/README.md](scripts/README.md) for placement rules.

New product HTTP endpoints begin in their application feature with contracts,
a server handler, a route, and a validated browser client when needed. Use the
shared request boundary and JSON helper. Promote shared capabilities according
to the conditions above. When adding provider configuration, update the env schema, its
consumer, examples, and tests together. The shared foundation now includes account schema/migrations, auth endpoints,
monitoring and request guards, schema-validated namespaced caches, async hooks,
and shadcn primitives with Storybook tests. Feature-specific business schemas,
email delivery, OAuth, model integrations, and external monitoring backends
remain application extensions.
