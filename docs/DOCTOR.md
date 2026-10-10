# Local diagnostics and dependency auditing

Run `bun --no-env-file run doctor` after cloning, installing, or changing local
configuration. Doctor runs TypeScript source directly and needs no `dist`.
Before installation it checks the toolchain, manifests, lockfile, and Git hooks;
runtime validation is skipped with an instruction to install dependencies.
It never installs dependencies, enables hooks, creates env files, builds,
migrates, starts the application, or prints configuration values.

The command starts a child Bun process in `apps/web`. Bun loads that application's
env files in the same way as production start. Inherited process variables win,
including empty strings. Application files have increasing precedence: `.env`,
`.env.{NODE_ENV}`, `.env.local` (except in test), `.env.{NODE_ENV}.local`.
The existing server parser then applies defaults, conditional credentials, and
nonblank Nitro listener overrides. Ordinary `bun run doctor` can inherit values
already loaded from the root `.env`; the invocation above avoids that outer
loading. Doctor does not change the parent process environment.

By default, doctor performs local read-only checks. A valid configuration does
not mean an unprobed database or running service is ready. Missing dependencies,
an absent local env file, or disabled hooks are warnings, with explicit skipped
checks where appropriate.

```sh
bun --no-env-file run doctor --json
bun --no-env-file run doctor --database
bun --no-env-file run doctor --probe http://127.0.0.1:3000
```

`--database` opens an existing SQLite file read-only in a separate process,
checks the four auth tables and recorded migration hashes, and closes it.
Relative database paths resolve from `apps/web`, just like start and migration.
It does not create missing files, apply migrations, or inspect account rows.
In-memory databases cannot be inspected across processes and are skipped.

`--probe` accepts an HTTP(S) origin without credentials, paths, queries, or
fragments. It requests `/api/health` and `/api/ready`, validates their shared
response schemas, rejects redirects, bounds response bodies to 64 KiB, and
uses one five-second deadline. Failed optional checks with overall readiness
`ok` produce a warning; unavailable readiness produces an error. Database
inspection also has a five-second subprocess deadline.

JSON output contains `schemaVersion: 1`, an overall status, and checks with
stable `id`, `status`, `code`, and fixed messages. Check statuses are `ok`,
`warning`, `error`, or `skipped`; optional `fields` contain supported env field
names and `fix` contains a suggested command. No raw env values, database paths,
probe URLs, remote bodies, driver errors, or stacks are returned. Exit codes are
0 when no check failed (warnings/skips remain visible), 1 for failed checks,
and 2 for invalid arguments or an internal diagnostic failure. JSON stdout is
one report; text output is a human-readable equivalent.

`runDoctor(options)` and `doctorExitCode(report)` are reusable exports from
`scripts/doctor.ts`. `runDoctor` takes an explicit repository root and optional
environment; library callers supply already-loaded env values. Only the CLI
performs Bun's application-cwd bootstrap.

Run `bun run check:unused` for Knip's dependency and dead-code audit. Its entries
come from package public exports, actual framework routes/configurations, tests,
and narrowly documented dynamic CLI/fixture entries. CSS imports, Vite's
toolchain alias, and the logger's named/default compatibility export are explicit
exceptions. Public APIs are retained even when this template has no caller.
The root check and CI include the audit; staged hooks keep their faster scope.
The former config CLI and historical tsconfig migration script are retired;
use the root scripts and shared config presets instead.
