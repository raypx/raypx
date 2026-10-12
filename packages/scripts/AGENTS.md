# @voidmix/scripts

## Purpose

The private repository CLI. Turbo owns the task graph; this package owns
procedural operations that understand the repository or the database. It exposes
the `vmx` bin.

## Interface

```text
src/cli.ts          bin entry; routes `tasks` and `env -- <cmd>` before citty
src/root.ts         citty command registry
src/commands/       adapters: tasks, clean, env, generate, desktop, verify, shadcn
src/runtime/        action boundary, context, env, logger, process, repository
src/database/       command, operation, policy, PostgreSQL user adapter
src/admin/          command and administrator operation
src/doctor/         command, checks, runtime probes, report rendering
src/deps/           Bun dependency maintenance commands and operations
src/skills/         repository skill maintenance commands and operations
src/policy/         command, orchestration, checks/<rule-domain>, manifest rules,
                    fixes, per-convention pure modules, report
src/i18n/          catalog comparison, Oxc source inspection, rules and reporting
src/test-fixtures.ts shared isolated repository and injected dependency fixtures
src/verify/         isolated Nitro runtime verification
```

Commands: `tasks <task> [Turbo flags]`, `env -- <command>`, `doctor`, `deps check|update|dedupe|audit`, `skills update`, `clean [--dependencies] [--bun-cache]`, `db migrate|seed|studio`,
`admin create`, `generate`, `desktop build`, `policy`, `verify [--verbose]`,
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
  structured logging via `@voidmix/shared/logger`.
- **Destructive database operations are restricted to development and test.**
  `database/policy.ts` owns that gate; do not bypass it.
- `vmx env -- <command>` uses the Dotenvx programming API directly, loads
  `.env.local` then `.env` without overriding inherited values, never mutates
  global `process.env`, and must not recursively wrap another `vmx` process.
  Tests are intentionally not wrapped.
- Use domain directories for naming context (`database/policy.ts`,
  `doctor/checks.ts`) instead of repeating prefixes in filenames.
- `policy/checks.ts` only orchestrates injected rule domains. Workspace, docs,
  skills, TypeScript, and manifest checks live under `policy/checks/`; manifest
  script/dependency rules live under `policy/manifests/`. Preserve the public
  `runPolicy` and manifest-rule interfaces when splitting internals.
- Architecture policy checks production dependency direction, cross-package
  private imports (including relative paths and aliases), and workspace cycles.
  Enum parity tests compare Core, Contracts and DB without adding runtime edges.
- Admin and seed commands compose Identity from Application, not Core.
- Dependency maintenance is explicit: `vmx deps dedupe` may rewrite `bun.lock`,
  `vmx deps dedupe --check` is read-only, and `vmx deps audit` is read-only.
- Dependency check/update excludes Drizzle RC builds because hash suffixes do
  not sort chronologically. Update Kit and ORM together from the `rc5` tag.
- Reuse `runtime/command.ts` for command adapters, `process-dependencies.ts` for
  repository subprocesses, and `runtime/files.ts` for traversal. Policy uses
  shared findings and strict JSON helpers without changing diagnostic content.
- Oxc owns JSX/TypeScript parsing; FormatJS through `@voidmix/i18n/testing` owns
  ICU parsing. Keep source exemptions and diagnostic locations covered.
- Never print secret values loaded by the env runner.
- Remote cache needs token, team and signature key; untrusted CI strips these.
  `VMX_REMOTE_CACHE_TRUSTED=true` is set only by the protected CI workflow.
- `verify` also starts the built Worker with `--check`; this probe needs no
  database or external providers and validates packaged imports and exporters.

## Verification

```bash
bun run --cwd packages/scripts check
bun run --cwd packages/scripts test
bun run doctor
```
