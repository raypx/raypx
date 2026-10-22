# @raypx/tooling

## Purpose

Private repository automation exposed as raypx-dev. Turbo owns task orchestration;
`@raypx-kit/devkit` owns workspace discovery, boundary and toolchain checks, the static
catalog reader, process helpers and artifact staging. This package supplies Raypx
conventions (`src/repository.ts`), policy, locale parity, scaffolding and product probes.

## Interface

- raypx-dev tasks <task> [Turbo flags]
- raypx-dev workspace list | new <name> --kind library --target universal [--write]
- raypx-dev policy | verify | doctor | clean
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
Turbo uses loose environment mode to inherit parent variables without task allowlists.
Keep variables affecting cached outputs in `env`/`globalEnv`.
Node and Cloudflare tasks cache different outputs. Verification builds both targets;
Worker probes use temporary roots and fixture bindings, never development dotenv files.
`./cloudflare` is the Node-executed probe runner; `./repository` exposes pinned-runtime
helpers to explicit integration tests. Node selection uses `NODE_BINARY` and
validates the version in `.nvmrc`. These config/test entries never enter product runtime code.
Smoke orchestration, Node probes and the Node-executed Worker harness live in
`src/smoke/`. Unit and integration tests live in `tests/unit/` and `tests/integration/`.
Keep scaffold and locale policy suites separate; shared temporary workspace fixtures
live in `tests/helpers/workspace.ts` and register cleanup for each suite.
Workspace scaffolding copies static configuration from `src/templates/workspace/`
into generated TypeScript paths. Its `agents.ts` renders workspace instructions;
manifest and TypeScript configuration data use JSON serialization.

## Verification

Run bun run --cwd packages/tooling test and check, then bun run policy.

`analytics sourcemaps <web|web-cloudflare|desktop>` prepares existing client
artifacts with the external PostHog CLI. Require release credentials and hidden
maps, upload before deleting maps, and never rebuild before deployment. The build
helper exposes only public release metadata and the hidden-map flag.
