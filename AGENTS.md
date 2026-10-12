# Raypx Repository Instructions

## Scope

These instructions apply to the entire repository. Every workspace also has its
own `AGENTS.md` whose rules apply only within that subtree and add more specific
constraints. The nearest file wins; it never contradicts this one.

## Read first

1. This file.
2. The `AGENTS.md` of the workspace being changed — it owns that workspace's
   interface, ownership, constraints, and verification commands.
3. `docs/README.md`, then the focused architecture or development document for
   the area being changed.
4. [Coding agents](docs/development/agents.md) for the read order, default
   decisions, and verification checklist.

Treat implementation and current tests as the final source of truth when a
document is stale, then update the document in the same change.

## Repository shape (dependencies flow downward only)

```text
apps        web, desktop, api, worker, storybook    composition roots; never imported
adapters    ai, application, cache, client, contracts, i18n, ui, agent-ui, storage    surfaces apps are allowed to use
core        core, db, auth, mail        db implements interfaces owned by core
foundation  shared, tsconfig                no dependency on anything above
tooling     scripts, e2e                never imported by runtime code
```

Each workspace's own `AGENTS.md` states its purpose, interface, and constraints.
This listing is exhaustive: `bun run policy` fails if a workspace is missing from
it, if it names one that does not exist, or if a directory appears under `apps/`
or `packages/` without a `package.json`.

## Architecture rules

- Frontend applications access backend behavior through `@raypx/client` and
  `@raypx/contracts`; they never import `@raypx/db`.
- `@raypx/core` stays independent of React, Hono, Nitro, and Drizzle.
- `@raypx/db` hides Drizzle implementation details behind repository
  interfaces owned by `@raypx/core`.
- `apps/api` performs final authentication and authorization checks; Web,
  Desktop, and Worker consume its contracts or shared application layer.
- Admin and its management RPCs are retired. Keep authentication, current account
  status checks and project capability enforcement in their owning layers.
- Runtime applications never import `@raypx/scripts`.
- `apps/worker` is the durable delivery and scheduling host. It may depend on
  `@raypx/application` and adapters, but never on Web/Desktop composition.
- Desktop is a cloud project client; native code owns only its window and tray.

## Toolchain

- Use Bun `1.4.0` for installation, the lockfile, and repository scripts.
- Application package names match their `apps/` directory without a scope;
  shared `packages/` and E2E keep `@raypx/`. See ADR-0022.
- Use the root Bun catalogs for third-party dependency versions and
  `workspace:*` for internal packages.
- Turbo is the only workspace task runner and task cache; Vite+ owns leaf tools.
  Use root build scripts so Turbo runs checks first; do not use the Vite+ task runner.
  See [ADR-0018](docs/architecture/decisions/0018-turbo-task-orchestration.md).
- Oxlint and Oxfmt ship inside Vite+ and are configured in `vite.config.ts`. Use
  `bun run lint` and `bun run format`. Do not add a separate linter, formatter,
  or git-hook manager. The committed `.vite-hooks/pre-commit` runs the staged-file
  pass after `vp hooks enable`; generated `.vite-hooks/_` files stay local.
- Bun `1.4.0` is the server, Worker/Runner, tooling and test runtime; Desktop uses
  Electrobun's pinned Bun host. Run JavaScript tool CLIs with `bun --bun` so their
  shebang cannot select Node. Hutch prepares/packages Desktop only; Bun/Turbo own
  the repository. See ADR-0024.
- Keep Bun-specific types or APIs local to Bun workspaces rather than shared
  TypeScript presets.
- Prefer root scripts to global tools so the repository-local versions run.

## Code and generated files

- The repository is ESM-first and TypeScript-strict. Preserve the compiler
  options provided by `@raypx/tsconfig`.
- `exactOptionalPropertyTypes` is on, so `{ key: undefined }` is illegal. Use
  conditional spread: `{ limit, ...(query ? { query } : {}) }`.
- `verbatimModuleSyntax` is on, so type-only imports need `import type`.
- Active protocol status values have matching declarations where used: a Core
  literal union, a Contracts `z.enum`, and a DB `pgEnum`. Update each consumer
  together. Historical audit enums remain DB compatibility data; do not restore
  retired management contracts or workflows.
- Relative import extensions are inconsistent per file. Mirror the neighbouring
  import rather than reasoning about it.
- Keep package interfaces small and avoid cross-layer imports for convenience.
- Use `bun run generate` for Drizzle artifacts. Route trees belong to the
  TanStack Start Vite plugin and are produced by `dev` or `build`; there is no
  standalone route-tree command, because the router CLI omits the Start
  `Register` footer.
- Do not hand-edit `routeTree.gen.ts` or generated Drizzle metadata unless the
  task is specifically about repairing generated output. `.prettierignore` keeps
  the formatter away from both for the same reason.
- Preserve unrelated changes in a dirty worktree. Never reset, overwrite, or
  delete user changes to simplify a task.

## UI conventions

- Reusable primitives live in `packages/ui`; page composition and
  application-specific navigation stay in the owning application.
- Shared Agent business views live in `packages/agent-ui`; apps own data and platform access.
- Do not introduce Radix primitives or Lucide icons without a recorded
  architecture decision under `docs/architecture/decisions/`.

See [`packages/ui/AGENTS.md`](packages/ui/AGENTS.md) for the primitive
conventions, the two file layouts, and the accessibility requirements.

## Logging, security, and data

- Use `@raypx/shared/logger` instead of application-local logger configuration.
- Import environment APIs from `@raypx/shared/env` and its explicit subpaths.
- Keep operational logs separate from durable domain facts.
- Never log credentials, cookies, authorization headers, passwords, secrets,
  tokens, or API keys.
- Retired management tables and historical SQL are preserved; removing unused
  source must not silently drop stored data or weaken current account/project access.
- Destructive database scripts are limited to explicit development/test
  environments.

## Testing

Run the workspace's own narrowest test first — its `AGENTS.md` names it — then
one command for everything else:

```bash
bun run verify
```

`verify` is the whole gate: i18n, policy, format, lint, per-workspace checks, tests,
builds, and the Nitro runtime probe, cheapest first. The other scripts exist to
narrow a failure down, not to be run in sequence:

| verify fails at  | iterate with                                           |
| ---------------- | ------------------------------------------------------ |
| i18n             | `bun run i18n:check`                                   |
| policy           | `bun run policy:fix`, then read what it could not fix  |
| format or lint   | `bun run format:fix`, then `bun run lint`              |
| check or test    | that workspace's own command, named in its `AGENTS.md` |
| build or runtime | `bun run build:<app>`                                  |

`bun run test:postgres` and `bun run test:e2e` stay outside it: both require an
explicit test database, and E2E also needs a Playwright browser. `bun run doctor`
asserts machine prerequisites and cannot run in CI. CI adds PostgreSQL 17,
browser, clean-tree and operating-system checks to `verify`.

Every application and test-bearing package owns an independent
`vitest.config.ts`. Preserve that boundary, never rely on a globally installed
`vp`, and leave `@raypx/e2e` outside `bun run test`. Most `test` scripts carry
`--passWithNoTests`, so confirm a new test actually ran.

The runner is `bun --bun vp test --run`; there is no direct `vitest` dependency, because
Vite+ bundles it and the test API is imported from `vite-plus/test`. Deleting a
workspace's `vitest.config.ts` admits its application Vite plugins into the
runner and breaks React 19 — the configs are load-bearing, not boilerplate.

The four `test:*` layer scripts are byte-identical across every workspace that
owns a `vitest.config.ts`, and `bun run policy` holds them there. They select a
layer with vitest's positional **substring filter**; a glob in that position
matches nothing and still exits 0.

[Testing and verification](docs/development/testing.md) is the authoritative
command list and explains the layer table, the reasons behind the boundary, and
Desktop's native checks.

## Documentation

- Update the workspace's own `AGENTS.md` when its interface, ownership,
  constraints, or verification commands change. Keep those files at or below 200
  lines and link to `docs/` instead of growing them.
- Update the focused file under `docs/architecture/` or `docs/development/` when
  architecture, tooling, commands, testing, or deployment behavior changes.
- Keep `docs/README.md` as the navigation index.
- `bun run policy` enforces these rules mechanically: workspace `AGENTS.md`
  structure and line cap, the workspace listing above, every relative
  documentation link, the project-skill wiring, workspace `.gitignore` anchoring,
  the `package.json` script and dependency contracts, and TypeScript preset
  inheritance. It fails on errors and prints warnings without failing.
