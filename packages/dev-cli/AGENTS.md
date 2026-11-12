# @raypx/dev-cli

## Purpose

The complete `raypx-dev` implementation: commands, repository policy, validation,
verification planning, CI gates, smoke probes and scaffolding. VP owns task
orchestration; `@raypx/tooling` owns the importable task, build and browser surface;
`@raypx/task-graph` owns discovery and the task graph; generic boundary, catalog,
document, artifact and change-scope mechanics live privately in `src/repo/`.

## Interface

`bin/raypx-dev.mjs` registers `raypx-dev` and calls `src/cli.ts` under Bun. The
package has no exports: nothing imports it, so its private code never reaches another
workspace's type check. Root and workspace scripts that invoke the command declare a
direct dependency. CI's minimal planner installs this package with production
dependencies only. For direct terminal use, run `bun link` here with Bun's global
bin directory on `PATH`.

`src/cli.ts` dispatches one command table: each entry declares its usage, summary,
whether it is internal (VP leaves and CI entries, omitted from help) and whether its
arguments pass through to another tool. Help and per-command `--help` come from the
table; each command lazily imports its own modules. Owned options parse with
`node:util` `parseArgs` in strict mode. Errors print their message; `RAYPX_DEBUG=1`
prints the stack.

Command behavior and the rules each check enforces are documented in
[Dev CLI commands and checks](../../docs/development/dev-cli.md).

## Constraints

- Nothing imports this package. It depends on Task Graph and Tooling public entries only.
- Do not import database, auth or client implementations; delegate database commands
  to Database scripts. Derive all workspace lists from manifests.
- Scaffolding previews by default and never overwrites.
- Use platform-neutral filesystem/process APIs. Never print loaded secrets.
- Keep reusable mechanics in `src/repo/` free of Raypx package names and paths.
- Reusable validation lives in `src/validation/`; `.artifacts/` holds generated evidence only.
- Keep the i18n runtime out of the dependency closure; ICU comparison uses the dev
  catalog's parser.
- Unit tests live beside source; integration tests in `tests/integration/`; shared
  temporary workspace fixtures in `tests/helpers/workspace.ts`.

## Verification

Run `bun run --cwd packages/dev-cli test` and `check`, `bun bin/raypx-dev.mjs doctor`,
then `bun run policy`. Check the production-only filtered install when runtime
dependencies change.
