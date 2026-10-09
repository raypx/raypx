# Raypx

TypeScript monorepo for a personal AI workbench, using Bun workspaces, Vite+,
and TanStack Start. The application currently provides a homepage, connection
checks, validated runtime configuration, request logging and correlation, safe
API errors, and readiness and shutdown infrastructure. Database, authentication,
storage, and worker utilities exist as server packages; their product features
are not wired into the web application.

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

| Package      | Current responsibility                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `contracts`  | Browser-safe Zod health, readiness, and API error contracts                                     |
| `api-client` | Validated JSON requests, typed errors, timeout, and cancellation                                |
| `hooks`      | Connection check state, retry, and unmount cancellation                                         |
| `ui`         | shadcn primitives, forms, dialogs, feedback, and themes; examples at `/components`              |
| `api`        | Request context, safe HTTP errors, probes, and runtime lifecycle                                |
| `env`        | Validated server configuration and an isolated, currently empty public configuration entrypoint |
| `logger`     | Structured evlog output, asynchronous context, levels, and credential redaction                 |
| `db`         | Lazy SQLite connection through better-sqlite3 and Drizzle, with real connection close           |
| `auth`       | Better Auth instance and session helpers; not mounted in web                                    |
| `storage`    | unstorage helpers for memory, filesystem, and optional Redis                                    |
| `worker`     | In-process task execution, progress, cooperative cancellation, and execution isolation          |
| `config`     | Engineering tasks, boundaries, aliases, styles, and static TypeScript presets                   |

TypeScript presets are exported as `@raypx/config/tsconfig/*.json`;
`@raypx/config/tsconfig-presets/*.json` remains a compatibility alias to the same
files. There is no separate active `@raypx/tsconfig` workspace or model SDK package.
See [ARCHITECTURE.md](ARCHITECTURE.md) for import constraints.

## Commands and Checks

| Command                                   | Purpose                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `bun run dev`                             | Build dependencies, then run watchers and Start                        |
| `bun run build`                           | Build runtime packages and the application                             |
| `bun run start`                           | Run the built server with Bun                                          |
| `bun run setup`                           | Create application configuration without overwriting it                |
| `bun run check:env`                       | Validate development tool versions and declarations                    |
| `bun run check:runtime-env`               | Validate current application runtime configuration                     |
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
build. Test APIs import from `vite-plus/test`; Hooks and UI use jsdom, other
packages use Node. Direct root `vp test` runs need existing production artifacts
or must exclude `production.test.ts`.

Storybook lives in `packages/ui` and runs independently of Start and server providers.
The full check includes its static build; browser story tests have their own command.
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
Currently no provider is registered. Shutdown marks readiness unavailable and
releases registered resources once, in reverse order, with a bounded deadline.

Unknown API paths use the shared error contract; unknown pages use Start's 404.
Request logs contain method, path, status, duration, and request ID. The optional
observation hook allows an application to connect a metrics sink; no external
error-monitoring service, metric backend, or alert delivery is configured.

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Environment Variables](ENV.md)
- [API Package](packages/api/README.md)
- [Code Examples](EXAMPLES.md)
- [Testing](TESTING.md)
- [AI Development Guide](CLAUDE.md)
