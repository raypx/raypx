# @raypx/scripts

## Purpose

The private repository CLI. Turbo owns the task graph; this package owns
procedural operations that understand the repository or the database. It exposes
the `rpx` bin.

## Interface

```text
src/cli.ts          bin entry; routes tasks, E2E and env arguments before citty
src/root.ts         citty command registry
src/commands/       adapters: tasks, clean, env, generate, desktop, verify, shadcn
src/runtime/        action boundary, context, env, logger, process, repository
src/database/       command, operation and development/test destructive gate
src/doctor/         command, checks, runtime probes, report rendering
src/deps/           Bun dependency maintenance commands and operations
src/skills/         repository skill maintenance commands and operations
src/architecture/   shared workspace boundary model and import resolution
src/lint/           Oxlint source-boundary plugin, metadata loading and rule tests
src/testing/        Bun/jsdom compatibility preload and DOM runtime verification
src/e2e/            browser selection and Playwright argument forwarding
src/policy/         command, orchestration, checks/<rule-domain>, manifest rules,
                    fixes, per-convention pure modules, report
src/i18n/          catalog comparison, Oxc source inspection, rules and reporting
src/test-fixtures.ts shared isolated repository and injected dependency fixtures
src/verify/         shared artifact staging, isolated HTTP and Worker verification
```

Commands: `tasks <task> [Turbo flags]`, `e2e [all|web|desktop] [--group <name>] [Playwright flags/files]`, `env -- <command>`, `doctor`, `deps check|update|dedupe|audit`, `skills update`, `clean [--dependencies] [--bun-cache]`, `db migrate|clean|push|studio`,
`db explain` (fixed development/test read catalog), `generate`, `desktop build`, `policy`, `verify [--verbose]`,
`shadcn update`.

## Ownership

- Own repository and database automation, environment file loading for
  development and build commands, and diagnostic reporting.
- Own no product behaviour or workspace task graph. `tasks` injects platform and
  cache trust policy; `verify` runs ordered task gates plus uncached runtime probes.

## Constraints

- **Runtime applications must never import this package.** It is tooling.
- Citty modules stay thin adapters. The house shape, which new modules must
  follow, is: a **pure check or operation function taking injected dependencies**
  (`doctor/checks.ts`), a **separate renderer** (`doctor/report.ts`), a
  **separate dependency factory** (`doctor/runtime.ts`), and a short command
  adapter (`doctor/command.ts`). This is what makes the logic testable without
  PostgreSQL, subprocesses, or optional tools.
- Every command declares a `process`, `repository`, or `database` environment
  policy, and the shared contextual action creates that context and registers its
  logger before invoking the operation.
- Commands must support non-interactive CI execution, explicit exit codes, and
  structured logging via `@raypx/shared/logger`.
- **Destructive database operations are restricted to development and test.**
  `database/policy.ts` owns that gate; do not bypass it.
- `rpx env -- <command>` uses the Dotenvx programming API directly, loads
  `.env.local` then `.env` without overriding inherited values, never mutates
  global `process.env`, and must not recursively wrap another `rpx` process.
  Tests are intentionally not wrapped.
- Use domain directories for naming context (`database/policy.ts`,
  `doctor/checks.ts`) instead of repeating prefixes in filenames.
- `policy/checks.ts` only orchestrates injected rule domains. Workspace, docs,
  skills, TypeScript, and manifest checks live under `policy/checks/`; manifest
  script/dependency rules live under `policy/manifests/`. Preserve the public
  `runPolicy` and manifest-rule interfaces when splitting internals.
- Oxlint's `raypx/boundaries` rule owns source import diagnostics, including
  private paths, aliases, renderer host boundaries and undeclared runtime edges.
  Policy owns manifest production dependencies and complete workspace cycles,
  including source edges. Both consume the single `architecture/` model.
  Enum parity tests compare Core, Contracts and DB without adding runtime edges.
- The Bun-loaded Oxlint plugin uses explicit `.ts` imports; the no-emit scripts
  workspace alone enables `allowImportingTsExtensions` for that entrypoint.
- Oxlint's bundled `RuleTester` rejects Bun. Boundary cases run against the real
  bundled CLI with a Bun-host assertion, preserving source and diagnostic coverage.
- The shared Vitest preload keeps jsdom's real DOM in Bun without its unsupported
  VM WindowProxy. Explicit jsdom script execution must use a browser test; focus,
  events, errors and teardown remain verified and component tests are never skipped.
- E2E execution still enters Turbo; the E2E adapter forwards Playwright arguments
  after Turbo's separator and binds the compiled client's API URL to the selected
  test port before building in production mode. The subsequent test task uses
  `--only` to avoid rebuilding dependencies in the driver's test mode.
  `--list` skips builds, servers and database setup.
- Applications use their unscoped directory name; packages and E2E retain the
  `@raypx/` scope. Filters and qualified Turbo tasks use the actual package name.
- `desktop build` first runs root `build:desktop` through Turbo, then invokes the
  Desktop `native:build` Electrobun packager.
- Dependency maintenance is explicit: `rpx deps dedupe` may rewrite `bun.lock`,
  `rpx deps dedupe --check` is read-only, and `rpx deps audit` is read-only.
- Dependency check/update excludes Drizzle RC builds because hash suffixes do
  not sort chronologically. Update Kit and ORM together from the `rc5` tag.
- Reuse `runtime/command.ts` for command adapters, `process-dependencies.ts` for
  repository subprocesses, and `runtime/files.ts` for traversal. Policy uses
  shared findings and strict JSON helpers without changing diagnostic content.
- Oxc owns JSX/TypeScript parsing; FormatJS through `@raypx/i18n/testing` owns
  ICU parsing. Keep source exemptions and diagnostic locations covered.
- Never print secret values loaded by the env runner.
- Remote cache needs token, team and signature key; untrusted CI strips these.
  `RPX_REMOTE_CACHE_TRUSTED=true` is set only by the protected CI workflow.
- Scripts and production probes run with the root-pinned Bun. Force JavaScript
  CLI binaries through `bun --bun` rather than their Node shebangs. Cache keys
  identify Bun's actual version/revision, platform, architecture and libc; prior
  Node runtime artifacts never share those keys.
- Workspace no-emit checks use Bun's native checker with an explicit tsconfig;
  `rpx tasks check` continues to delegate graph execution and caching to Turbo.
- Nitro runtime verification requires the `bun` preset. HTTP and Worker probes
  share complete artifact staging outside the checkout, preserving internal
  relative links and rejecting links that could resolve outside the artifact.
- Runtime probes alone request a parent-process deadline. Timeout sends SIGTERM,
  then SIGKILL if needed; staging cleanup waits for child close. Build and dev
  commands have no default deadline.
- Doctor probes only the local Electrobun bootstrap/SDK paths; it never downloads
  the native toolchain. Clean removes Desktop build/artifacts/project SDK caches,
  preserving native profiles and user data.
- `verify` starts the relocated Worker with `--check`; its same-entry
  `--runner --check` child validates Runner startup. This probe needs no database
  or external providers and validates the single executable, shared chunks and
  document exporters. Model and research execution are unavailable under
  [ADR-0027](../../docs/architecture/decisions/0027-remove-pi-sdk.md).

## Verification

```bash
bun run --cwd packages/scripts check
bun run --cwd packages/scripts test
bun run doctor
```
