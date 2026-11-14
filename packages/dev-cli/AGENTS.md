# @raypx/dev-cli

## Purpose

The complete `raypx-dev` implementation: commands, repository policy, validation,
verification planning, CI gates, smoke probes and scaffolding. Turbo owns task
orchestration and caching through the root `turbo.json`; `src/turbo.ts` is the only
launcher. `@raypx/tooling` owns the importable build and browser surface. Workspace
discovery, generic boundary, catalog, document, artifact and change-scope mechanics
live privately in `src/repo/`; `src/workspace-graph.ts` describes members and their
dependency edges for verification planning.

## Interface

`bin/raypx-dev.mjs` registers `raypx-dev` and calls `src/cli.ts` under Bun. The
package has no exports: nothing imports it, so its private code never reaches another
workspace's type check. Root and workspace scripts that invoke the command declare a
direct dependency. CI's minimal planner installs this package with production
dependencies only. For direct terminal use, run `bun link` here with Bun's global
bin directory on `PATH`.

`src/cli.ts` dispatches one command table: each entry declares its usage, summary,
whether it is internal (CI entries, omitted from help) and whether its
arguments pass through to another tool. Help and per-command `--help` come from the
table; each command lazily imports its own modules. Owned options parse with
`node:util` `parseArgs` in strict mode. Errors print their message; `RAYPX_DEBUG=1`
prints the stack.

Command behavior and the rules each check enforces are documented in
[Dev CLI commands and checks](../../docs/development/dev-cli.md).
`test sandbox` owns opt-in real-Engine conformance and isolation acceptance;
ordinary source verification never starts Docker or changes host firewall rules.
The gate builds default and optional graphical targets, records their byte sizes
and tests headless safety first. Optional graphical start/image/input/stream-stop
conformance has a separate result; unavailable Screen never counts as passed.
`--runtime` selects the registered OCI runtime (default runc). The gate additionally
probes privilege/kernel controls, fork/memory/disk exhaustion and peer network
isolation, private UTF-8 stdin/environment scope, and bounded inbox writes with
post-write accounting; evidence is under `.artifacts/sandbox-hosting/<runtime>/`.
Its `--with-egress` case uses Engine-host controls and owned DROP counters, and
checks network-policy peer credentials, rate/start/Space-day budgets, abuse ports,
connection limits and pre-conntrack datagram policing;
offline public HTTPS is explicitly unavailable. `--dns-resolver` selects the
public IPv4 DNS upstream shared by the supervisor and firewall probe.
`--engine-host-command` explicitly selects an argv prefix for root commands on a
VM Engine host with the checkout mounted at the same absolute path. The gate owns
a host-network canary and reports unavailable IPv6 separately.
`test backends --database-url` uses an explicitly selected disposable loopback
`*_test` or `*_test_<lane>` database without starting or stopping PostgreSQL.
Without that option it provisions its own temporary cluster; inherited URLs never
select a database.
With `--with-e2e`, `--visual` after the separator belongs to the browser wrapper;
remaining journey arguments pass through to Playwright.

## Constraints

- Nothing imports this package. It depends on Tooling and runtime-node public entries only.
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
