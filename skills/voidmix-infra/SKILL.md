---
name: voidmix-infra
description: >
  Project-specific workflows and footguns for the Voidmix monorepo. Use when
  changing apps/web, apps/api, apps/desktop, or any @voidmix package —
  oRPC contracts and procedures, Drizzle schema and migrations, domain rules,
  TanStack Start routes, packages/ui primitives, auth and permissions, audit
  records, logging, or the test and verification loop.
---

# Develop Voidmix

`AGENTS.md` holds the constraints and `docs/` holds the reasoning. This skill
holds neither — it holds the **procedures**: which files to touch in which order,
and the specific ways this repo bites. Never restate an `AGENTS.md` rule here.

Code and current tests are the final source of truth. Confirm every path below
still exists before relying on it.

## Task routing

Load only the playbook that matches the task.

- Adding or changing an oRPC procedure: read [`orpc-procedures.md`](references/orpc-procedures.md).
- Changing `packages/db` schemas, relations, queries, or migrations: read
  `packages/db/AGENTS.md` and apply the vendored `postgres-drizzle` skill. This
  repository uses Drizzle 1.0 RC: relations use `defineRelations`, the client is
  initialized with `drizzle({ relations })`, and schema changes require
  `bun run generate`.
- Route loaders, `beforeLoad`, or server functions: read
  [`tanstack.md`](references/tanstack.md) **before** the vendored
  `tanstack-*-best-practices` skills. They are wrong in specific, load-bearing
  places for this repository.

For `packages/ui`, domain rules, or scripts, work from the nearest `AGENTS.md`,
the focused `docs/` document, and the existing local pattern; add a reference
playbook only when a repeated cross-workspace edit order proves valuable.

Vendored skills under `.agents/skills/` cover their own frameworks: `hono`,
`postgres-drizzle`, `shadcn`, and the two TanStack ones. They know their library
but not this repository, so they never override an `AGENTS.md` rule. Never edit
them; corrections go in `references/`.

## Workflow

1. Read `git status`, the nearest `AGENTS.md`, and the focused `docs/` document.
2. Route to the narrowest owning layer and task playbook above.
3. Implement the smallest complete capability, preserving unrelated changes.
4. Run the owning workspace's narrowest verification, then broaden by risk.
5. Update focused architecture/development documentation when behavior changes.

## Traps the constraints do not name

`AGENTS.md` states the repository-wide rules — read them there. These are the
things that mislead in the moment and belong to no single rule:

- **There is no audit, authorization, or rpc package.** Audit lives in
  `packages/core` plus `packages/db`; authorization is `packages/auth`; the RPC
  surface is `packages/contracts` plus `packages/client`.
- **`check` is `tsc --noEmit` only** — it does not lint or format. Those are
  `bun run lint` and `bun run format` (`format:fix` to rewrite).
- **`noUnusedLocals` / `noUnusedParameters` are on in `apps/web`**, so an
  unused import fails its `check` even when another workspace would allow it.
- **`routeTree.gen.ts` is written by `@tanstack/start-plugin-core`, not by
  `tsr generate`.** The router CLI omits the Start `Register` footer, so running it
  standalone produces a worse file that still passes `tsc` and that the next
  `dev` or `build` silently repairs. Web has no `generate-routes` script.
- **Never use a globally installed `vp`.** Its bundled Vitest is a different
  physical dependency tree from the workspace's `vite-plus/test` and fails with
  `Cannot read properties of undefined (reading 'config')`. `vp test` is the leaf test runner;
  `vmx tasks test` runs that script across the Turbo graph. Never use `vp run`.

## Verification

- API behavior changes: `bun run --cwd apps/api test`.
- Database changes: `bun run generate`, then `bun run --cwd packages/db check`
  and `bun run --cwd packages/db test`.
- Route changes: build the owning app before checking it so generated route
  trees are refreshed.
- Use `bun run verify` for the complete repository gate. The authoritative
  command matrix lives in [`docs/development/testing.md`](../../docs/development/testing.md).

Import the test API from `vite-plus/test`, never from `vitest`. Filename encodes
the layer: `*.test.ts` unit, `*.integration.test.ts` integration,
`*.component.test.tsx` component, `e2e/tests/*.spec.ts` Playwright.

## Documentation

Update `docs/architecture/` for boundary changes and `docs/development/` for
workflow, tooling, or testing changes. Keep `docs/README.md` as the index.
Use repository-relative links; never embed machine-specific absolute paths.
