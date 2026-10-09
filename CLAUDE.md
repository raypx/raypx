# Raypx AI-Assisted Development Guide

## Project Status

Raypx is an engineering foundation for personal AI workbench, using Bun workspaces, Vite+, React, and TanStack Start.
Currently implements homepage, health check, timeout/cancellation/retry, and technical layer package separation.
AI sessions, model calls, database, login, and file storage are not yet implemented, do not describe skeleton as available features.

Fixed versions: Bun 1.4.0, Node.js 22.21.1, Vite+ 1.1.0.
Bun is package manager, internal engineering script, and production service runtime; config tools directly expose `.ts` entrypoints, no initial build needed.
Internal scripts execute TS with Bun; Vite+ loads same tools via Node.js 22.21.1 native type stripping.
Vite+, Vitest, Oxlint, and tsc preserve Node tool entrypoints. Root `package.json` defines workspaces/catalogs, `bun.lock` fixes installation results.
Bun can directly execute TypeScript but does not do complete type checking; must still run tsc and maintain strict configuration.
Start and Nitro versions follow lockfile; Nitro is fixed beta version, upgrades require re-verification of production runtime.
Git author and all package authors use `Zack <heyloyep@gmail.com>`.

## Code Placement

- `apps/web`: Start file routing, page assembly, SSR, server adapters, and deployment entrypoint.
- `packages/contracts`: Zod contracts and types, health check imports from `@raypx/contracts/health`.
- `packages/api-client`: HTTP requests, response validation, timeout, and cancellation.
- `packages/hooks`: React data state, retry, and lifecycle cleanup.
- `packages/ui`: Pure presentation components and styles, no data fetching or route references.
- `packages/api`: Server handler logic, health check entrypoint is `@raypx/api/health`.
- `packages/ai`, `db`, `auth`, `storage`, `logger`: Server capability skeletons.
- `packages/env`: Separately exposes client/server configuration entrypoints, no business configuration implementation yet.
- `packages/tsconfig`: Shared strict TypeScript static configuration, use `@raypx/tsconfig/*.json` entrypoints.
- `packages/config`: Tasks, boundaries, aliases, and style tools, directly consume TypeScript tool entrypoints.

See [ARCHITECTURE.md](ARCHITECTURE.md) for complete responsibilities and dependency graph.

## Engineering Conventions

Use ESM and TypeScript strict, preserve `noUncheckedIndexedAccess`.
Runtime packages output ESM and declaration files, React in UI and Hooks is peer dependency.
Config tools use direct `.ts` entrypoints, checked via `tsconfig.test.json` noEmit configuration.
Runtime packages preserve `tsconfig.json` build and `tsconfig.test.json` test/configuration checks, do not change ESM and declaration artifact conventions.
Engineering configuration references `@raypx/tsconfig/*.json`, no longer references `@raypx/config/tsconfig/*`.
Declare actually-used internal dependencies via `workspace:*`, use explicit public entrypoints, no cross-package `src` or `dist` access.
Prohibit packages reverse-depending on web, circular dependencies, or cross-layer references; after adding dependencies run `bun run check:boundaries`.

Start's route tree is auto-generated, do not manually edit `routeTree.gen.ts`.
`.server.ts` is for web server adaptation, server package isolation alongside Start `importProtection`.
Client must not import `api/ai/db/auth/storage/logger`, `env/server`, Node built-ins, or `bun`, `bun:*` built-ins.
Secrets only read server-side, do not use `VITE_` prefix, do not commit `.env` or output to logs.

Vite+ configuration centralized in `vite.config.ts`; tasks and same-named package scripts do not duplicate definitions.
`vp fmt` uses Oxfmt, `vp lint` uses Oxlint, complete type checking still executed by tsc.
Unified lint/fmt configuration follows root `vite.config.ts`; `.oxlintrc.json` and Oxlint replacing boundary check documentation are alternative options not adopted, current vp scripts do not use this configuration.
Preserve `packages/config/src/check-boundaries.ts` AST checking, both standalone `check:boundaries` and complete `check` execute it.
Test API explicitly imports from `vite-plus/test`, default Node environment, Hooks/UI use jsdom.
Running `bun run test` uses repository Vitest configuration; do not change to calling Bun native runner's `bun test`.
Test files use `.test.ts`, `.spec.ts`, or corresponding TSX suffixes, cover actual behavior, do not write empty tests for empty skeletons.

## Common Modification Flows

When adding HTTP capability, add contract and explicit export in `contracts`, implement handler in `api`,
adapt via web `.server.ts` and expose through Start server route. Browser calls go to `api-client`,
React state goes to `hooks`, presentation to `ui`, pages finally assembled by web.
Do not pass server credentials to client components, nor put Node-specific logic in browser-usable packages.

New pages go in Start file routing directory, reuse existing UI. New server capabilities implement in corresponding skeleton package,
only install dependencies actually needed by selected solution, supplement input/output, failure paths, and runtime boundary validation.
See [EXAMPLES.md](EXAMPLES.md) for code examples.

## Verification & Runtime

```sh
bun install --frozen-lockfile
bun run dev
bun run check:boundaries
bun run check
bun run test:watch
bun run test:coverage
```

Development command first builds all runtime packages, then watches in parallel, visit http://127.0.0.1:5173.
Complete check first builds to generate Start routes, then executes format, lint, boundaries, type, and test checks.
Production tests require `.output/`, watch excludes this test. Coverage currently has no enforced threshold.

```sh
bun run build
bun run start
```

Production uses Nitro Bun preset, run by Bun at `.output/server/index.mjs`, default port 3000; web's `.env` can set HOST/PORT.
See [ENV.md](ENV.md) and [TESTING.md](TESTING.md) for details.

## Troubleshooting

- Missing package declaration or artifacts: execute `bun run build`, do not bypass exports by importing other package source.
- Route tree missing: start `bun run dev` or build, generated by Start.
- Development port conflict: free 5173; production port configured by web `.env` `PORT`.
- Cache anomaly: check `bun run vp run --last-details`, execute `bun run vp cache clean` when needed.
- Client import protection failure: move server logic back to correct package/adapter, do not disable protection rules.

Commit messages use Conventional Commits, like `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, or `chore:`.
Preserve existing uncommitted content, distinguish implemented features from future directions when updating documentation.
