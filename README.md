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
Node.js 22.22.1). Bun installs workspaces and runs production; Vite+, Vitest,
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

For a combined local diagnosis, run `bun --no-env-file run doctor`, optionally
with `--json`. It works before the initial build and reports missing dependencies,
tool versions, application configuration, and hook setup. Database and service
checks are explicit: add `--database` or `--probe http://127.0.0.1:3000`.
See [Doctor](docs/DOCTOR.md) for report semantics and environment loading.

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

| Command                                   | Purpose                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `bun run dev`                             | Build dependencies, then run watchers and Start                                   |
| `bun run build`                           | Build runtime packages and the application                                        |
| `bun run start`                           | Run the built server with Bun                                                     |
| `bun run setup`                           | Create application configuration without overwriting it                           |
| `bun run check:env`                       | Validate development tool versions and declarations                               |
| `bun run check:runtime-env`               | Validate current application runtime configuration                                |
| `bun --no-env-file run doctor`            | Diagnose local tools, configuration, dependencies, and hooks                      |
| `bun run db:migrate`                      | Apply database migrations explicitly before enabling account features             |
| `bun run check:boundaries`                | Check package dependencies, exports, cycles, and browser isolation                |
| `bun run check:unused`                    | Audit unused files, exports, and dependencies with Knip                           |
| `bun run check:consumer`                  | Verify built packages in independent Node, Bun, TypeScript, and browser consumers |
| `bun run typecheck`                       | Check source and test TypeScript                                                  |
| `bun run test`                            | Run package tests and production integration tests                                |
| `bun run test:watch`                      | Watch tests, excluding production integration tests                               |
| `bun run test:coverage`                   | Build and run tests with V8 coverage                                              |
| `bun run lint` / `bun run lint:fix`       | Check or fix lint issues                                                          |
| `bun run format` / `bun run format:check` | Write or check formatting                                                         |
| `bun run staged`                          | Validate tools, then lint and format staged files                                 |
| `bun run check`                           | Build, format, lint, boundaries, unused code, types, tests, and consumers         |
| `bun run test:e2e`                        | Test application pages in Chromium against development and production             |
| `bun run test:consumer:browser`           | Test an independent UI consumer in Chromium                                       |
| `bun run storybook`                       | Explore UI components, states, Controls, Docs, and themes on port 6006            |
| `bun run storybook:build`                 | Build the standalone static UI reference                                          |
| `bun run storybook:install`               | Install Chromium for browser story tests                                          |
| `bun run storybook:test`                  | Render stories and verify interactions and accessibility                          |

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

Application E2E and independent consumer browser tests have separate commands.
They use isolated configuration and owned servers; CI runs all three browser
suites after installing Chromium once. Consumer acceptance installs compiled
packages outside the repository without source aliases or repository dependency
links. See [TESTING.md](TESTING.md) for coverage and failure reports.

Build, type check, and test tasks use local cache with transitive inputs;
watching and production startup do not cache. Root `vite.config.ts` owns lint,
formatting, test projects, and coverage. The AST boundary checker additionally
protects package imports. See [TESTING.md](TESTING.md).

## Git Hooks

`bun install` runs `prepare` to install the Vite+ dispatcher for the root
`.vite-hooks/pre-commit` hook. Each commit validates the pinned Node/Bun versions,
then runs `vp staged` using the `staged` rules in root `vite.config.ts`. JavaScript
and TypeScript files run `vp check --fix` for formatting and lint fixes, with
warnings treated as failures; supported document, style, and configuration files
are formatted.
Vite+ includes staged-file tooling, and automatically adds successful fixes to
the index while preserving unstaged changes. Full type checking, boundaries,
builds, and tests remain in `bun run check` and CI.

Hooks require Git 2.32.0 or later. The generated `.vite-hooks/_/` dispatcher is
ignored; the project hook and staged configuration belong in version control.
For an existing clone, run `bun run prepare`, or explicitly enable hooks:

```sh
bun run vp hooks enable --hooks-dir .vite-hooks
bun run vp hooks status
bun run staged
```

`bun run vp hooks disable` records a local opt-out that survives installation;
`bun run vp hooks enable` enables them again. `VP_GIT_HOOKS=0` skips hooks for
one process or environment. See the [Vite+ commit hooks guide](https://viteplus.dev/guide/commit-hooks).

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
Request logs contain method, path, status, duration, and request ID. The request
boundary tracks both response-ready and response-finished phases, including
stream cancellation and failure. Existing request metrics retain their response-ready
semantics; separate response metrics cover the complete application stream lifecycle.
The optional observation hooks allow an application to connect a metrics sink; no external
error-monitoring service, metric backend, or alert delivery is configured.

## Documentation

- [Reusable Foundations](docs/FOUNDATIONS.md)
- [Architecture](ARCHITECTURE.md)
- [Environment Variables](ENV.md)
- [API Package](packages/api/README.md)
- [Code Examples](EXAMPLES.md)
- [Testing](TESTING.md)
- [AI Development Guide](CLAUDE.md)
