# @raypx/tooling

## Purpose

Private repository automation exposed as raypx-dev. VP owns task orchestration;
`@raypx-kit/devkit` owns workspace discovery, boundary and toolchain checks, the static
catalog reader, process helpers and artifact staging. This package supplies Raypx
conventions (`src/repository.ts`), policy, locale parity, scaffolding and product probes.

## Interface

- raypx-dev tasks <task> [VP options]
- raypx-dev e2e [--web|--desktop] [--smoke] [--visual] [--dry-run] [-- Playwright flags]
- raypx-dev workspace list | new <name> --kind library --target universal [--write]
- raypx-dev policy | verify | verify:quick | doctor | clean
- `verify:quick` checks source and tests; `verify` additionally builds and probes artifacts.
- `clean` removes workspace outputs, native SDK/bundles and local test artifacts;
  it awaits asynchronous deletion in batches of eight. Dependencies, lockfiles
  and persistent user/database data stay intact.
- raypx-dev smoke:cloudflare runs relocated Worker outputs under Node and Wrangler/workerd.
- raypx-dev env -- <command>, db <operation>, desktop build
- `./build/nitro` supplies shared Node/Workers build options to API and Web configs.

## Constraints

No product workspace imports this package at runtime. Do not import database, auth or
client implementations; delegate database commands to database's scripts. Derive all
workspace lists from manifests. Scaffolding previews by default and never overwrites.
Use platform-neutral filesystem/process APIs. Never print loaded secrets.
Generic checks belong in @raypx-kit/devkit; keep only Raypx-specific rules here.
Read i18n's public static `./config` through workspace discovery for locale policy;
do not add the i18n runtime to root tooling's dependency closure.
Preserve the Bun/jsdom preload and independent workspace test runners.
The shared preload lives in `tests/setup/`. Scaffolded test workspaces include
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
The runner resolves `NODE_BINARY` before launching VP or nested Bun scripts.
Node and Cloudflare tasks cache different outputs. Verification builds both targets;
Worker probes use temporary roots and fixture bindings, never development dotenv files.
`./cloudflare` is the Node-executed probe runner; `./repository` exposes pinned-runtime
helpers to explicit integration tests. Node selection uses `NODE_BINARY` and
validates the version in `.nvmrc`. These config/test entries never enter product runtime code.
`./browser-tests` combines browser surface/smoke/grep filters. Browser launchers
select pinned Node and synthetic analytics for every mode; live acceptance stays separate.
Browser argv travels through `RAYPX_E2E_ARGS` to the uncached `browser:run` leaf,
never dependency passthrough: test flags must not invalidate build/check dependencies.
The config caps local defaults at four workers only with 8+ CPUs and 16+ GiB;
smaller hosts use one or two, and CI defaults to two. Explicit Playwright flags win.
`./browser-server` serves only compiled Desktop client assets on loopback with
HTML deep-link fallback; never run Vite configuration or simulate backend/Native IPC there.
Smoke orchestration, Node probes and the Node-executed Worker harness live in
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

`analytics sourcemaps <web|web-cloudflare|desktop>` prepares existing client
artifacts with the external PostHog CLI. Require release credentials and hidden
maps, upload before deleting maps, and never rebuild before deployment. The build
helper exposes only public release metadata and the hidden-map flag.
