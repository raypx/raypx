# Raypx Architecture

Raypx uses Bun workspaces to manage technical layer packages. TanStack Start is the only full-stack application entrypoint,
providing file routing, SSR, HTTP routing, and Nitro server artifacts. Bun manages dependencies and runs project scripts and production service,
Vite+ handles package building, Vitest tests, Oxlint checks, and local cache; these tools currently preserve Node runtime entrypoints.

## Package Responsibilities

| Package                                 | Current Responsibility                      | Runtime Boundary    |
| --------------------------------------- | ------------------------------------------- | ------------------- |
| `web`                                   | Routing, page assembly, SSR, server adapters, and deployment | Full-stack app |
| `contracts`                             | Zod health check contracts and inferred types | Browser & server   |
| `api-client`                            | Health check fetch, contract validation, timeout, and cancellation | Browser-usable |
| `hooks`                                 | Connection check state, retry, and lifecycle cleanup | React, SSR-capable |
| `ui`                                    | Button, status display, and styles          | React, SSR-capable  |
| `api`                                   | Health check and API JSON 404 response      | Server-side         |
| `ai`, `db`, `auth`, `storage`, `logger` | Buildable empty modules, reserved capabilities | Server-side      |
| `env`                                   | Empty client/server config entrypoints      | Isolated by entrypoint |
| `tsconfig`                              | Shared strict TypeScript static JSON config | Engineering config  |
| `config`                                | Tasks, boundaries, source aliases, and style tools | Engineering tools |

`contracts` replaces original `shared`, only contains contracts and types shared by frontend and backend, does not read environment or execute requests.
`api-client` is current explicit HTTP interface call layer, not a TanStack Start required layer.
When adding Start server functions in future, web preserves framework adaptation, business capabilities continue in related packages.

## Dependencies & Import Boundaries

Current business dependency chain:

```text
web pages ──→ hooks ──→ api-client ──→ contracts
         └──→ ui
web HTTP routes ──→ .server.ts adapters ──→ api ──→ contracts
```

Future server dependency directions available; only add `workspace:*` dependencies after code actually uses:

```text
api  → ai / auth / db / storage / env / logger
     → contracts
auth → db / env / logger / contracts
ai / db / storage → env / logger
```

All packages prohibited from reverse-depending on web, circular dependencies prohibited. Cross-package only uses explicit `exports` in manifest,
does not reference another package's `src` or `dist`. React in UI and Hooks uses peer dependency.
`ui` does not depend on request layer or routing, `hooks` only executes connection check in client effect.

Web's `.server.ts` files are adaptation layer between Start routes and server packages.
Server isolation jointly enforced by Start `importProtection` and engineering boundary checks, cannot rely solely on file naming.
Client import graph prohibited from containing `api`, `ai`, `db`, `auth`, `storage`, `logger`, and `env/server`.
Client also prohibited from Node built-ins and `bun`, `bun:*` built-ins.
`env/client` only allows public configuration; secrets read server-side.

`bun run check:boundaries` checks dependency declarations, cycles, allowed dependency directions, public entrypoints, and source imports.
Checking continues using `packages/config/src/check-boundaries.ts` TypeScript AST implementation, included in complete `bun run check`.
Lint/fmt uses Vite+ `vp lint`, `vp fmt`, unified configuration follows root `vite.config.ts`; `.oxlintrc.json` only preserved as unadopted alternative configuration, current vp scripts do not use it.
Start build further checks actual client import graph. When adding entrypoints or packages, synchronously update boundary rules, cannot bypass checks.

## Current Data Flow

Homepage SSR outputs initial connection state. After browser hydration, Hooks initiates health check:

1. `hooks` creates this check and cancellation control, manages loading, success, and error states.
2. `api-client` requests same-origin `/api/health`, handles HTTP errors, 5 second timeout, caller cancellation, and response contract validation.
3. Start server route calls `api` via web server adapter.
4. `api` returns `{ "status": "ok", "service": "raypx-api" }`, complying with `contracts/health` contract.
5. `ui` displays Hook state; on failure clicking retry starts new request, unmount cancels old request.

Unknown `/api` paths return `{ "error": "Not found" }` and HTTP 404; unknown pages return Start page 404.
Current health check does not access database, model service, or login state.

## Build & Development

Runtime packages use tsc to output ESM and declaration files in `dist/`, UI styles copy to artifacts and expose exports.
`tsconfig` static JSON configuration and `config` tools do not depend on initial compilation, directly usable by each package.
Runtime package `tsconfig.json` defines artifacts; `tsconfig.test.json` only checks source, tests, and Vite configuration, does not generate files.
These packages reference two engineering packages via devDependencies, do not make them product runtime dependencies.
Each package's Vite Task build executes in topological order via workspace dependencies `dependsOn`.
Development first builds all runtime packages, then runs compilation watching, UI style watching, and Start in parallel.

Build, type check, and tests use local cache, input covers transitive dependency source, configuration, and static assets, excludes output.
Start outputs `.output/` and generated route tree; after deleting output can recover from build cache.
Development watching, format fix, and production start do not cache. Project has no remote cache or independent API process.

## Extension Conventions

When adding interfaces, first define public contract in `contracts`, then implement handler logic in `api`,
exposed via web server adapter and Start route; when browser HTTP call needed, wrap in `api-client`.
New pages assembled by web, reuse UI and Hooks, do not reverse-place app routing into packages.

Database, authentication, model, and storage have not yet selected providers or SDKs. Related packages currently only provide empty module skeletons.
When implementing these capabilities, add runtime dependencies and tests in corresponding packages; server configuration parsing in `env/server`,
logging in `logger`. Do not describe future interfaces, variables, or product features as existing capabilities.

Bun workspaces and catalogs located in root `package.json`, installation results fixed via `bun.lock`.
`config` directly exposes `.ts` tool entrypoints, internal relative imports also use `.ts`, no initial build needed.
Internal boundary and style scripts execute with Bun; Vite+ loads same tools via Node.js 22.21.1 native type stripping.
Directly executing TypeScript only solves runtime steps, does not execute complete type checking, config still checked by tsc noEmit configuration.
Runtime packages continue using tsc to output ESM and declaration files, do not skip type checking because Bun supports TypeScript.

Deployment uses Nitro Bun preset, runs `apps/web/.output/server/index.mjs` with Bun, default production port 3000.
Currently fixed Bun 1.4.0, Node.js 22.21.1, Vite+ 1.1.0, and Nitro `3.0.260903-beta`.
After framework and task version upgrades, re-verify SSR, hydration, interfaces, static assets, cache, and server isolation.
