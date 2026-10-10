# Raypx AI-Assisted Development Guide

## Project Status

Raypx is a full-stack foundation using Bun workspaces, Vite+, React, and
TanStack Start. It provides runtime validation, safe HTTP boundaries, logging,
metrics, provider lifecycle, explicit SQLite migrations and authentication,
validated cache helpers, reusable query hooks, and shadcn components.
Applications activate providers and add their own business rules.

Use the versions in `.bun-version` and `.node-version` (Bun 1.4.2 and Node.js
22.22.1). Bun installs dependencies and runs production; Node-compatible Vite+,
Vitest, Oxlint, and tsc entrypoints remain part of the toolchain. Bun executing
TypeScript does not replace strict type checking. Authors use
`Zack <heyloyep@gmail.com>`.

## Code Placement

- `apps/web`: Start routing, SSR, framework adapters, initialization, and deployment.
- `apps/web/src/features/<feature>/hooks`: Product-specific query, mutation, and workflow hooks; colocate feature contracts and clients in the same feature.
- `packages/contracts`: Browser-safe Zod contracts and inferred types.
- `packages/client`: React-free validated HTTP core, errors, timeout, and cancellation.
- `packages/client/src/react`: Reusable browser-safe data hooks, auth mutations, and explicit React/TanStack Query adapters, exported as `@raypx/client/react`.
- `packages/ui`: Components, styles, and component behavior hooks at `@raypx/ui/hooks`; no business workspace dependencies.
- `packages/api`: Request context, safe errors, metrics, guards, probes, and lifecycle.
- `packages/db`, `auth`, `storage`, `logger`, `worker`: Server capabilities with explicit activation and resource ownership.
- `packages/env`: Separate client/server exports; no mixed root entrypoint.
- `packages/config`: Engineering tools and static `@raypx/config/tsconfig/*.json` presets. The `tsconfig-presets` path is a compatibility export.

The former `@raypx/api-client` and `@raypx/hooks` packages are removed without
aliases. Migrate HTTP imports to `@raypx/client`, business hooks to
`@raypx/client/react`, and component behavior to `@raypx/ui/hooks`.
See [ARCHITECTURE.md](ARCHITECTURE.md) and [EXAMPLES.md](EXAMPLES.md).

## Engineering Conventions

Use ESM and strict TypeScript with `noUncheckedIndexedAccess`; do not use `any`.
Runtime packages output ESM and declarations. Separate `tsconfig.test.json`
checks source, tests, and engineering configuration without emitting files.
Engineering tools expose `.ts` entrypoints and need no initial build.
Declare workspace dependencies explicitly and use public exports; never import
another package's `src` or `dist`. Packages cannot depend on apps or form cycles.

The client may depend on `contracts`, and UI has no business workspace
imports. Client core source cannot import React, React Query, or the React
adapter through any path or reexport. Only `src/react` owns React dependencies;
Start-specific modules belong in web. Browser code cannot import server
packages, `env/server`, or Node/Bun built-ins. Engineering packages remain
`devDependencies` and cannot be imported by runtime source.

Web creates a QueryClient for each SSR router/request and preserves its browser
router's cache through navigation. Never put a shared server query cache at
module scope. SSR prefetches require request-aware query functions. Private
queries include account identity and are cleared when authentication changes.
UI hooks handle behavior such as debounce, not business requests or sessions.

Start generates `routeTree.gen.ts`; do not edit it. Web `.server.ts` modules
adapt server packages, alongside Start's import protection. Secrets stay on
the server, never use a `VITE_` prefix, and are not committed or logged.

Root `vite.config.ts` owns Vite+ lint, formatting, and test projects.
`.oxlintrc.json` is an optional standalone configuration, not the current
`vp lint` configuration. The TypeScript AST checker enforces dependencies,
public exports, browser isolation, and client core/React separation in both
`check:boundaries` and the full check. Test APIs import from `vite-plus/test`;
React tests use jsdom and server tests use Node. Do not add placeholder tests.

## Common Modification Flows

Begin product endpoints in `apps/web/src/features/<feature>/`: colocate their
contracts, browser clients, `.server.ts` implementations, and `hooks`, then bind
the Start route. Reuse shared HTTP boundaries and `requestJson`. Component
behavior hooks such as debounce belong in `ui/hooks`.

Promote data capabilities to `contracts`, client core, and `client/react` only
after demonstrated reuse across applications or independent consumers. Require
stable validated contracts, browser-safe transport, explicit framework adapters,
public exports, and meaningful tests/documentation. The shared client must work
without product routes, workflows, application stores, or server configuration.
Sharing among components of one product alone does not require a public package.
Keep product state and composition in web so client does not become an application store.
Start routing, providers, and SSR integration remain in web. Provider configuration requires
schema validation, explicit activation, readiness, disposal, and failure tests.

See [architecture references](ARCHITECTURE.md#references-for-these-boundaries)
for the specific boundaries borrowed from shadcn, LobeHub, and TanStack. Raypx
retains its existing TanStack Query implementation and new-york/Radix UI registry.

## Verification and Runtime

```sh
bun run check:env
bun install --frozen-lockfile
bun run setup
bun run check:runtime-env
bun run dev
bun run check:boundaries
bun run check
```

Development builds dependencies and starts watchers and Start on port 5173.
The full check builds, then runs formatting, lint, boundaries, types, and tests.
Production integration tests need built artifacts. Run `bun run build` then
`bun run start` for Nitro's Bun artifact. Production defaults to
`127.0.0.1:3000`; validated HOST/PORT and NITRO overrides configure the listener.
Run `bun run db:migrate` explicitly before enabling account features.
See [ENV.md](ENV.md), [TESTING.md](TESTING.md), and
[Reusable foundations](docs/FOUNDATIONS.md).

Use Conventional Commits. Preserve existing uncommitted content and distinguish
implemented capabilities from future extensions when updating documentation.
