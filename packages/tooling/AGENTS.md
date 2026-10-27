# @raypx/tooling

## Purpose

Private repository automation exposed as raypx-dev. VP owns task orchestration;
`@raypx-kit/devkit` owns workspace discovery, boundary and toolchain checks, the static
catalog reader, process helpers and artifact staging. This package supplies Raypx
conventions (`src/repository.ts`), policy, locale parity, scaffolding and product probes.

## Interface

- raypx-dev tasks <task> [VP options]
- raypx-dev test [suite] [--package name|path] [VP options] [-- runner arguments]
  Root owns this aggregate; package scripts own actual suites. `test list` discovers
  capabilities. Tooling owns test:inventory/test:backends; E2E owns browser gates.
- raypx-dev e2e [--web|--desktop] [--smoke] [--visual] [--dry-run] [-- Playwright flags]
- raypx-dev workspace list | new <name> --kind library --target universal [--write]
- raypx-dev policy | verify | verify:quick | doctor | clean
- raypx-dev test:inventory [--layers] [--baseline file] [--owners file]
- raypx-dev test:backends [--with-e2e [-- Playwright flags]]
- `raypx.taskScripts` delegates a public package script to a terminal runner inside
  VP's leaf. Validate both names, refuse chains/cycles and retain public task argv.
- `clean:artifacts` removes reports, coverage, test-report caches and browser results,
  preserving builds, SDKs, dependencies and source. `clean` includes these paths.
- `verify:quick` checks source and tests; `verify` additionally builds and probes artifacts.
- Optional root `rust:*` tasks run Cargo uncached, separately from default Bun gates.
  Cargo owns incremental compilation under `target/`.
- `clean` removes workspace outputs, native SDK/bundles and local test artifacts;
  it awaits asynchronous deletion in batches of eight. Dependencies, lockfiles
  and persistent user/database data stay intact.
- `clean` also removes root Cargo `target/`; `clean:artifacts` preserves it.
- raypx-dev env -- <command>, db <operation>, desktop build
- `./build/nitro` supplies shared Nitro Bun build options to API and Web configs.

## Constraints

No product workspace imports this package at runtime. Do not import database, auth or
client implementations; delegate database commands to database's scripts. Derive all
workspace lists from manifests. Scaffolding previews by default and never overwrites.
Use platform-neutral filesystem/process APIs. Never print loaded secrets.
Generic checks belong in @raypx-kit/devkit; keep only Raypx-specific rules here.
Reusable validation lives in `src/validation/`; `.artifacts/` contains generated
evidence only. Inventory compares case multiplicity and checks exact file selection.
Backend validation provisions only owned temporary services, resolves binaries from
PATH or explicit binary settings, and stops children before deleting their data.
Read i18n's public static `./config` through workspace discovery for locale policy;
do not add the i18n runtime to root tooling's dependency closure.
Preserve the shared happy-dom setup and independent workspace test runners.
The shared setup lives in `tests/setup/dom.ts`. Scaffolded test workspaces include
`tests/` in strict checking and use the root runner defaults.
`./tasks` exposes Node-compatible, lightweight task configuration. Its model derives
all members and scripts from manifests, registers private `task:*` definitions and
explicit dependencies; VP alone schedules them. Leaf scripts stay available for
direct debugging. Task definitions inherit the environment with `untrackedEnv`,
while outcome-affecting fields and per-task argument keys participate in fingerprints.
`raypx.uncachedTasks` opts specific scripts out. Tooling's complete test suite starts
independent cached VP runners, so it must run without an enclosing filesystem tracer;
`test:unit` remains cached and `test:integration` always executes.
Platform/toolchain identity is also part of each command. Native SDK preparation
is uncached; native checks fingerprint SDK files after that dependency completes.
Verification builds the API/Web outputs and probes them under the running Bun using temporary
roots and fixture environments. `src/validation/toolchain.ts` reads the single Bun pin from
`packageManager` and rejects Node pins. These config/test entries never enter product runtime code.
`./browser-tests` combines browser surface/smoke/grep filters. Browser launchers
select synthetic analytics for every mode; live acceptance stays separate.
Browser argv travels through `RAYPX_E2E_ARGS` to the uncached `browser:run` leaf,
never dependency passthrough: test flags must not invalidate build/check dependencies.
The config caps local defaults at four workers only with 8+ CPUs and 16+ GiB;
smaller hosts use one or two, and CI defaults to two. Explicit Playwright flags win.
`./browser-server` serves only compiled Desktop client assets on loopback with
HTML deep-link fallback; never run Vite configuration or simulate backend/Native IPC there.
Smoke orchestration and artifact probes live in
`src/smoke/`. Unit and integration tests live in `tests/unit/` and `tests/integration/`.
Keep scaffold and locale policy suites separate; shared temporary workspace fixtures
live in `tests/helpers/workspace.ts` and register cleanup for each suite.
The inventory regression requires a focused command for each active test layer,
rejects empty layer commands and `.only`, and keeps PostgreSQL/Redis and Playwright
outside ordinary Vitest layers. Scaffolding with tests creates a strict default
runner; add focused commands when their first real suites exist.
Workspace scaffolding copies static configuration from `src/templates/workspace/`
into generated TypeScript paths. Every scaffold registers a lightweight task config.
Its `agents.ts` renders workspace instructions;
manifest and TypeScript configuration data use JSON serialization.

## Verification

Run bun run --cwd packages/tooling test and check, then bun run policy.

`analytics sourcemaps <web|desktop>` prepares existing client
artifacts with the external PostHog CLI. Require release credentials and hidden
maps, upload before deleting maps, and never rebuild before deployment. The build
helper exposes only public release metadata and the hidden-map flag.
