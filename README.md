# Raypx

TypeScript monorepo for a personal AI workbench, using Bun workspaces, Vite+,
and TanStack Start. The application currently provides a homepage, connection
checks, validated runtime configuration, request logging and correlation, safe
API errors, metrics and request protection, and readiness and shutdown infrastructure.
Optional account endpoints use a migrated SQLite schema and an explicitly configured
Better Auth instance. Cache helpers, async hooks, and shadcn components are reusable
across features. See [Reusable foundations](docs/FOUNDATIONS.md) for activation and APIs.

Author: Zack <heyloyep@gmail.com>

## Local Development

Use the versions in `.bun-version` and `.node-version` (currently Bun 1.4.2 and
Node.js 22.21.1). Bun installs workspaces and runs production; Vite+, Vitest,
Oxlint, and tsc retain Node-compatible tool entrypoints.

```sh
bun run check:env
bun install --frozen-lockfile
bun run setup
bun run check:runtime-env
bun run dev
```

Open http://127.0.0.1:5173. `setup` copies `apps/web/.env.example` to
`apps/web/.env` without replacing an existing file. `check:env` verifies tool
versions and declaration consistency; `check:runtime-env` validates application
configuration without starting the service. Neither prints application values.
Development first builds runtime packages, then runs package watchers and Start.

Dependencies are declared by each workspace and locked in `bun.lock`.
`bunfig.toml` uses the isolated linker. Scripts use the repository's Vite+
installation; no global `vp` is required. `bun run test` uses Vitest, while
`bun test` is Bun's separate test runner.

## Packages

`apps/web` owns routing, SSR, server adapters, and deployment. Runtime packages
expose explicit public entrypoints and reuse one another through `workspace:*`.

| Package     | Current responsibility                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `contracts` | Browser-safe Zod health, readiness, account, pagination, and API error contracts                |
| `client`    | React-free HTTP core; `client/react` adds business queries, mutations, and Query cache helpers  |
| `ui`        | shadcn components, themes, and component behavior hooks; examples at `/components`              |
| `api`       | Request context, safe errors, metrics, rate/origin guards, probes, and runtime lifecycle        |
| `env`       | Validated server configuration and an isolated, currently empty public configuration entrypoint |
| `logger`    | Structured evlog output, asynchronous context, levels, and credential redaction                 |
| `db`        | Runtime-appropriate SQLite driver, Drizzle schema/migrations, transactions, and owned lifecycle |
| `auth`      | Explicit Better Auth factory, session checks, and optional application endpoints                |
| `storage`   | Driver helpers and validated namespaced caches with TTL, coalescing, and invalidation           |
| `worker`    | In-process task execution, progress, cooperative cancellation, and execution isolation          |
| `config`    | Engineering tasks, boundaries, aliases, styles, and static TypeScript presets                   |

TypeScript presets are exported as `@raypx/config/tsconfig/*.json`;
`@raypx/config/tsconfig-presets/*.json` remains a compatibility alias to the same
files. There is no separate active `@raypx/tsconfig` workspace or model SDK package.
See [ARCHITECTURE.md](ARCHITECTURE.md) for import constraints.

Use `@raypx/client` or its HTTP subpaths without React, `@raypx/client/react`
for business data hooks, and `@raypx/ui/hooks` for behavior such as debounce.
`client` depends only on `contracts` among business workspaces; UI has none.
The former `@raypx/api-client` and `@raypx/hooks` packages are removed without
compatibility aliases. Start integration stays in web, where each router owns
an isolated QueryClient for SSR and browser navigation. See the
[client package guide](packages/client/README.md) for entrypoints and migration.

## Commands and Checks

| Command                                   | Purpose                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `bun run dev`                             | Build dependencies, then run watchers and Start                        |
| `bun run build`                           | Build runtime packages and the application                             |
| `bun run start`                           | Run the built server with Bun                                          |
| `bun run setup`                           | Create application configuration without overwriting it                |
| `bun run check:env`                       | Validate development tool versions and declarations                    |
| `bun run check:runtime-env`               | Validate current application runtime configuration                     |
| `bun run db:migrate`                      | Apply database migrations explicitly before enabling account features  |
| `bun run check:boundaries`                | Check package dependencies, exports, cycles, and browser isolation     |
| `bun run typecheck`                       | Check source and test TypeScript                                       |
| `bun run test`                            | Run package tests and production integration tests                     |
| `bun run test:watch`                      | Watch tests, excluding production integration tests                    |
| `bun run test:coverage`                   | Build and run tests with V8 coverage                                   |
| `bun run lint` / `bun run lint:fix`       | Check or fix lint issues                                               |
| `bun run format` / `bun run format:check` | Write or check formatting                                              |
| `bun run check`                           | Build, format, lint, boundaries, type checking, and tests              |
| `bun run storybook`                       | Explore UI components, states, Controls, Docs, and themes on port 6006 |
| `bun run storybook:build`                 | Build the standalone static UI reference                               |
| `bun run storybook:install`               | Install Chromium for browser story tests                               |
| `bun run storybook:test`                  | Render stories and verify interactions and accessibility               |

Package tasks live in their `vite.config.ts`, for example
`bun run vp run @raypx/contracts#build`. Runtime packages compile to ESM and
TypeScript declarations. Engineering tools and JSON presets need no initial
build. Test APIs import from `vite-plus/test`; client React and UI tests use
jsdom, server packages use Node. Direct root `vp test` runs need existing production artifacts
or must exclude `production.test.ts`.

Storybook lives in `packages/ui` and runs independently of Start and server providers.
The full check includes its static build; browser story tests have their own command.
Its 118 stories include component behavior hooks and interaction checks.
See the [UI package guide](packages/ui/README.md#storybook).

Build, type check, and test tasks use local cache with transitive inputs;
watching and production startup do not cache. Root `vite.config.ts` owns lint,
formatting, test projects, and coverage. The AST boundary checker additionally
protects package imports. See [TESTING.md](TESTING.md).

## Production Runtime

```sh
bun run build
bun run start
```

Production startup runs in `apps/web`, loads its `.env`, and validates runtime
values before creating the listener, including direct execution of the Nitro
artifact. The effective listener defaults to `127.0.0.1:3000`; containers can
set `HOST=0.0.0.0`. `NITRO_HOST` and `NITRO_PORT` override `HOST` and `PORT`.
The Nitro plugin normalizes listener values, initializes logging, and wraps
requests with isolated context and `x-request-id` response headers.
See [ENV.md](ENV.md) for supported fields and empty-value behavior.

`GET /api/health` is a lightweight liveness probe returning
`{ "status": "ok", "service": "raypx-api" }`. `GET /api/ready` returns readiness
with HTTP 200 or 503. It checks only explicitly registered resources and does
not open unused databases, initialize authentication, or connect Redis.
Enabling authentication registers its database. Shutdown marks readiness unavailable and
releases registered resources once, in reverse order, with a bounded deadline.

Unknown API paths use the shared error contract; unknown pages use Start's 404.
Request logs contain method, path, status, duration, and request ID. The optional
observation hook allows an application to connect a metrics sink; no external
error-monitoring service, metric backend, or alert delivery is configured.

## Documentation

- [Reusable Foundations](docs/FOUNDATIONS.md)
- [Architecture](ARCHITECTURE.md)
- [Environment Variables](ENV.md)
- [API Package](packages/api/README.md)
- [Code Examples](EXAMPLES.md)
- [Testing](TESTING.md)
- [AI Development Guide](CLAUDE.md)
