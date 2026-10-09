# Raypx

TypeScript monorepo for personal AI workbench, using Bun workspaces, Vite+, and TanStack Start.
Currently implements basic engineering, homepage, and service connection check; sessions, model, database, login, and file storage not yet integrated.

Author: Zack <heyloyep@gmail.com>

## Local Development

Install Bun 1.4.0 (see `.bun-version`) and Node.js 22.21.1 (see `.node-version`).
Bun handles workspaces, dependency installation, project scripts, and production service; Vite+, Vitest, Oxlint, and tsc currently still execute through compatible Node tool entrypoints. Bun does not replace TypeScript type checking.

Root `package.json`'s `devEngines` declares development toolchain Node.js 22.21.1 and package manager Bun 1.4.0,
consistent with version files, `packageManager`, and `engines.bun`.
Bun 1.4.0 itself does not enforce `devEngines.onFail`, project supplements with native TypeScript environment checking:
Before installation and all public root script execution, checks actual Node, Bun versions in PATH and available package manager identifier,
while validating version declaration consistency. On failure outputs actual vs expected values and exits non-zero.
Checking requires no dependency installation, nor automatically downloads runtimes; CI explicitly executes before frozen install.

```sh
bun run check:env
bun install --frozen-lockfile
bun run dev
```

Open http://127.0.0.1:5173. Start provides both pages and `/api` interfaces, homepage displays real connection status with retry support.
Development command first builds all runtime packages, then starts package watching and Start dev server in parallel.
No need to globally install `vp`, scripts use repository-fixed Vite+ 1.1.0.
Workspace and catalog configuration in root `package.json`, dependencies locked in `bun.lock`.
`bunfig.toml` explicitly adopts isolated linker, each workspace resolves packages by its own dependency declarations;
when adding package dependencies, declare in the workspace using it, do not rely on accidentally visible transitive dependencies.
Running project tests uses `bun run test`, executed by Vitest; `bun test` is Bun's own test command.

## Project Structure

`apps/web` is the only application, handles Start file routing, page assembly, SSR, server adapters, and deployment entrypoint.
`packages/` contains 13 `@raypx/*` workspaces, reused through explicit public entrypoints and `workspace:*` dependencies.

| Package      | Responsibility & Current Content                                                 |
| ------------ | -------------------------------------------------------------------------------- |
| `contracts`  | Browser-usable Zod contracts and types, health check entrypoint `@raypx/contracts/health` |
| `api-client` | Health check HTTP request, response validation, 5 second timeout, and cancellation |
| `hooks`      | React connection check state, retry, and unmount cancellation                    |
| `ui`         | Button, connection status display, and base styles, no data fetching or routing  |
| `api`        | Server health check and JSON 404 handling, entrypoint `@raypx/api/health`       |
| `ai`         | Model integration skeleton, no model SDK or call implementation                  |
| `db`         | Database skeleton, no connection, Schema, or migration implementation            |
| `auth`       | Authentication skeleton, no login or session implementation                      |
| `storage`    | Storage skeleton, no file or object storage implementation                       |
| `env`        | Configuration skeleton, separately exposes `./client` and `./server`, no business variable parsing |
| `logger`     | Server logging skeleton, no logging implementation                               |
| `tsconfig`   | Static TypeScript configuration, entrypoint `@raypx/tsconfig/*.json`            |
| `config`     | Tasks, boundaries, test aliases, and style tools, does not carry TypeScript static configuration |

Skeleton packages only provide buildable empty modules and responsibility descriptions. `shared` replaced by `contracts`.
See [ARCHITECTURE.md](ARCHITECTURE.md) for dependency constraints and extension methods.

## Common Commands

| Command                    | Purpose                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `bun run dev`              | Initial compile then start package watching and Start, no cache  |
| `bun run build`            | Build packages and application in dependency order, use local cache |
| `bun run start`            | Start built full-stack service with Bun, no cache                |
| `bun run lint`             | Oxlint check, warnings also fail check                           |
| `bun run lint:fix`         | Fix auto-fixable lint issues                                     |
| `bun run format`           | Oxfmt format, no cache                                           |
| `bun run format:check`     | Only check format                                                |
| `bun run check:env`        | Check actual dev tool versions and declaration consistency, no dependency installation needed |
| `bun run check:boundaries` | Check package dependencies, cycles, public entrypoints, and client import boundaries |
| `bun run typecheck`        | tsc type check, use cache                                        |
| `bun run test`             | Each package unit tests and web production integration tests, use cache |
| `bun run test:watch`       | Watch unit tests, exclude production integration tests           |
| `bun run test:coverage`    | Complete tests and V8 coverage report                            |
| `bun run check`            | Build, format, lint, boundaries, type, and test checks, for CI   |

Run individual package tasks: `bun run vp run @raypx/contracts#build`.
Task definitions in each package `vite.config.ts`, same-named package scripts do not duplicate definitions.
Runtime packages use tsc to output ESM and declaration files; UI styles sync to artifacts and expose exports.
`tsconfig` static JSON configuration and `config` TypeScript tool entrypoints directly consumable, no initial build needed; internal scripts executed by Bun,
Vite+ tools run via Node.js 22.21.1 native type stripping. Neither replaces tsc type checking.
Runtime package `tsconfig.json` handles build, `tsconfig.test.json` handles source, tests, and Vite configuration noEmit type checking.
Start auto-generated route tree recovers with build cache.

Build, type check, and tests use local cache, watching, format fix, and production start do not cache.
Cache input includes transitive dependency source, configuration, and static assets. View recent task summary:
`bun run vp run --last-details`; clean cache: `bun run vp cache clean`.

## Testing & Code Checks

Vite+ 1.1.0 provides Vitest 5.0.3, Oxlint 1.87.0, and Oxfmt 0.72.0.
Root `vite.config.ts` manages test projects, TS/TSX coverage, and lint rules, each package defines actual test directories.
Lint/fmt unified via `vp lint`, `vp fmt`, following root `vite.config.ts`; `.oxlintrc.json` only preserved as unadopted alternative configuration, current vp scripts do not use it.
Package boundaries continue enforced by `packages/config/src/check-boundaries.ts` AST checking, included in complete check.
Test API imports from `vite-plus/test`; default environment Node, Hooks and UI use jsdom and Testing Library.
Tests use precise source aliases to access public package entrypoints, watch does not depend on package pre-compilation.

Oxfmt uniformly uses root `vite.config.ts` `fmt` configuration: two-space indent, double quotes, semicolons, trailing commas, and LF line endings,
skips generated route tree and build artifacts. `bun run format` writes format, `bun run format:check` only checks; CI's `bun run check` includes format check.
VS Code workspace recommends Oxc extension, after installation auto-formats on save, using same root configuration.

```sh
bun run test
bun run test:watch
bun run test:coverage
bun run vp test run --project contracts
```

Complete tests prepare artifacts needed for production integration tests. When running `vp test` directly in root directory, need to build first,
or exclude `production.test.ts`. Coverage output to root `coverage/`, includes HTML and JSON summary,
no coverage threshold currently set. Independently started production server not counted in Vitest unit test coverage.
See [TESTING.md](TESTING.md) for more details.

Oxlint checks TypeScript, React, JSX accessibility, and test rules, including floating Promises,
incorrect async callbacks, Hooks usage, and `.only` tests. tsc handles complete type checking.

## Production Runtime

```sh
bun run build
bun run start
```

Default production port 3000, development port 5173. Copy `apps/web/.env.example` to `.env` in same directory,
can configure production listen `HOST` and `PORT`; containers typically use `HOST=0.0.0.0`.
Production task runs in web directory, uses Bun to read `.env` and run `.output/server/index.mjs`.
Nitro fixed at `3.0.260903-beta`, using Bun preset; re-verify build and runtime on upgrade.
See [ENV.md](ENV.md) for environment variables and configuration boundaries.

`GET /api/health` returns `{ "status": "ok", "service": "raypx-api" }`.
Unknown `/api` paths return JSON 404, unknown pages return Start page 404.

## Development Documentation

- [Architecture & Package Dependencies](ARCHITECTURE.md)
- [Environment Variables](ENV.md)
- [Code Examples](EXAMPLES.md)
- [Testing Conventions](TESTING.md)
- [AI-Assisted Development Guide](CLAUDE.md)
- [TanStack Start Guide](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch)
- [Vite+ Tasks & Cache](https://viteplus.dev/guide/run)
