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

- raypx-dev tasks <task> [VP options]
- raypx-dev test [suite] [--package name|path] [VP options] [-- runner arguments]
  Root owns this aggregate; package scripts own actual suites. `test list` discovers
  capabilities. Dev CLI owns test:inventory/test:backends; E2E owns browser gates.
- raypx-dev e2e [--package web|desktop] [--web|--desktop] [--smoke] [--visual] [--dry-run] [-- Playwright flags]
- raypx-dev format [--write] [files] defaults to VP's format check and forwards native VP formatter flags.
- raypx-dev workspace list | new <name> --kind library --target universal [--write]
- raypx-dev i18n
  Discover `locales/<language>/<namespace>.ts` or `.json` from workspace manifests;
  compare namespace/key, ICU syntax, argument and rich-tag parity without executing
  modules. Reject duplicate formats/ownership and missing supported languages.
  Language `index.ts` files explicitly assemble owned namespaces; AST checks verify registration.
  Only apps spread shared public entries from the same language, with no namespace overwrites.
  TS uses literal objects, JSON nested strings. Include both formats in cache inputs;
  validate without generating or executing catalogs.
- raypx-dev policy | verify | doctor | clean | clean:artifacts
  `policy` also checks public entries (`src/validation/entries.ts`): every exports key
  of a library or tooling workspace needs an importer in another workspace, found in
  JS/TS module imports, CSS `@import`/`@source` and tsconfig `extends` (root config
  included). Suites, `tests/` files and `e2e` are test importers: they keep `./testing*`
  entries and tooling surfaces alive; other entries need production use. `raypx.entryConsumers` is the declared-exception escape hatch and is
  validated against the exported keys.
  `policy` also requires one workspace to declare `use-intl`, rejects `next-intl` and keeps
  FormatJS runtimes out of other product workspaces (`src/validation/intl-engine.ts`).
- raypx-dev test inventory [--layers] [--baseline file] [--owners file]
- raypx-dev test backends [--with-e2e [-- Playwright flags]]
- raypx-dev size [--package name|path] [--native] [--browser] [--require]
  Discovers buildable workspaces, measures existing deployable directories and CLI
  runtime components, and writes JSON/Markdown under `.artifacts/sizes/`. Native
  mode adds actual production bundles/installers; browser mode selects Desktop's
  compiled browser fixture. Missing outputs are unavailable; `--require` rejects them.
  CI appends tables to its summary after selected builds/cache restoration and uploads
  reports. Sizes count regular files, excluding symlinks; components/bundles overlap
  and must not be added together. Measurement never launches a build or smoke task.
- `raypx.taskScripts` selects a private package script for the VP task. Validate
  both names, refuse chains/cycles and retain public task argv.
- `clean:artifacts` removes reports, coverage, test-report caches and browser results,
  preserving builds, staged sidecars, dependencies and source. `clean` includes these paths.
- `verify` selects affected JavaScript source/tests and native-input Go tasks; `verify --full` checks
  all current-platform JavaScript/Go sources, builds and probes. `--base` selects a Git
  base; `--dry-run` prints the plan, local test selection/reasons and expanded VP graph.
  `--no-cache` forwards to VP for container runs where filesystem tracing is unavailable.
  Local tests follow source imports, retaining integration and filesystem/process
  assertions; indirect consumers and unknown/configuration/deleted inputs use complete
  suites. CI and `--full` always run complete selected workspace suites. File arguments
  use the existing per-task argument keys, never aggregate dependency arguments.
  API relay fixture edits also select the CLI task lifecycle suite. Both fixture
  files are explicit inputs to the CLI test cache.
  Dev CLI policy, validation, verification and tests select Dev CLI only; its command,
  repository and test-runner modules retain all source checks. Tooling tests select
  Tooling; exported Tooling code follows static entry dependencies and actual import
  consumers. Task machinery, unknown/deleted inputs and unresolved export graphs
  retain all source checks.
- Local verification lives in `verification/index.ts`; `plan.ts` selects tasks and
  `execution.ts` runs the VP graph. `verification/ci.ts` adapts GitHub events and dispatches
  workers. CI, deployment and artifact probes load at their command or selected stage.
  Go-only inputs select Go checks without renderer suites. Workflow orchestration and
  `native-checks` action edits select Dev CLI plus relevant acceptance; shared install/cache
  actions retain all source checks. Mixed source/configuration changes combine their scopes.
- CI consumes the same planner through private `ci:plan`/`ci:gate` entries. It emits
  one versioned plan bound to `GITHUB_SHA`; workers consume `RAYPX_CI_PLAN`
  instead of recomputing scope. `verification/gates.ts` owns CI gate registration and
  selection. The `source` matrix runs `ci:gate source checks|tests` on parallel runners.
  Checks owns style, policy/locales, types, selected current-platform Go checks and
  full-mode builds/probes; tests owns complete selected workspace suites. The planner
  omits the test runner when no suites are selected. Each phase has a separate VP cache;
  checks retains the `javascript` partition. The final gate rejects unregistered jobs, inconsistent plan outputs,
  failed/cancelled jobs and unexplained skips. Local evidence records running,
  passed or failed status so a failed run cannot retain a previous success.
  Shared or unknown inputs broaden source checks without requesting release builds/audits. Missing Git
  bases also select native checks conservatively. Browser-target frontend
  changes reach only browser consumers (`src/verification/platform.ts`). Required results
  distinguish intentional skips from missing/cancelled/failed gates. The `container-smoke`
  job runs isolated Compose/Railway acceptance for Dockerfiles, deployment adapters and
  image acceptance inputs and its reusable workflow, plus manual/tag CI runs. Main
  workflow orchestration edits do not request container builds. Ordinary source, dependency and
  application build-config changes use source gates; Railway owns production image builds.
  Source-only verify remains independent of Docker.
- Branch/PR native gates run only for native/IPC/terminal/daemon inputs, CLI runtime
  packaging helpers and their regressions, and select
  macOS/Windows by platform-specific filenames; shared native CI inputs default to Windows.
  Manual `macos` includes macOS; release tags require both platforms. `cold_native` disables
  native compiler caches for comparisons while retaining VP caches for shared JavaScript inputs.
  JavaScript dependency reach alone does not select native runners. Installers, signing and installed
  GUI acceptance require a tag push or manual `distribution` request; release gates
  run in parallel and the final result validates their selection against the event.
  Routine native acceptance builds the CLI and runs the shared `native-checks` action
  on one runner, reusing its install and caches without a renderer build or artifact
  handoff. Distribution alone prepares the renderer and transports the immutable CLI
  to parallel checks/package/smoke phases. The same action owns process/CLI/Herdr/Go
  acceptance and evidence in both paths; action changes select native runners.
  Herdr runs before Go checks, leaving distribution package/smoke independent of terminal-test duration.
  Native checks also accept process/task runners and the installed CLI against the
  verified prepared payload, with size and acceptance reports retained for seven days.
  Changes to those runners, their acceptance tests and native gate selection trigger
  the default Windows gate even when no Desktop source changes.
- `clean` removes workspace outputs, staged MyGo resources/generated assets and local test artifacts;
  it awaits asynchronous deletion in batches of eight. Dependencies, lockfiles
  and persistent user/database data stay intact.
- raypx-dev env -- <command>. Root database scripts load the development environment
  through this command and delegate to Database. `package:desktop` selects the
  existing `desktop#native:build` task.
- Desktop's default build/check only verifies the renderer and scripts. Explicit
  `native:build` and native smoke/agents tasks are uncached, depend on the
  renderer and matching CLI build, then stage the sidecar. `dev` stages that CLI
  before starting Vite and MyGo. Direct Desktop scripts enter the same VP graph.
  Native CI checks Go on each platform.
- `raypx-dev deployment:smoke [--platform linux/amd64|linux/arm64]` builds both image
  profiles with an owned bounded builder, isolated temporary services and a synthetic
  API-owned account fixture. Share SSR/API assertions with relocated artifact probes.
  API bundles the fixture without embedded environment values; mount it read-only into
  the prepared Bun migration image on the owned network. Measure acceptance, teardown
  and cleanup separately without recording credentials or overlapping stage durations.
  Always clean only owned resources; retain protected evidence under `.artifacts/deployment/`.

## Constraints

Nothing imports this package. Keep the dependency direction Dev CLI → Tooling and Task Graph; use only Tooling's public entries. Do not import database, auth or
client implementations; delegate database commands to database's scripts. Derive all
workspace lists from manifests. Scaffolding previews by default and never overwrites.
Use platform-neutral filesystem/process APIs. Never print loaded secrets.
Keep reusable mechanics in `src/repo/` free of Raypx package names and paths.
Explicit full verification runs Knip; `bun run knip` remains available for maintenance.
Knip runs under Bun, which classifies ws/undici as runtime modules; the Node-compatible
HTTP adapter retains their explicit dependencies and types for its Node consumers,
with a scoped Knip exception in that workspace. Root transitive dependency overrides
use Bun's `resolutions` field so Knip can track their catalog references directly.
Native Go-launched TS fixtures and the presets' dynamically invoked task leaf are
explicit Knip entries. Vendored skills are excluded;
the root `skills` CLI is retained for the explicit `skills:update` maintenance command.
Reusable validation lives in `src/validation/`; `.artifacts/` contains generated
evidence only. Inventory compares case multiplicity and checks exact file selection.
It collects Vitest JSON reports from the selected workspaces.
Backend validation provisions only owned temporary services, resolves binaries from
PATH or explicit binary settings, and stops children before deleting their data.
Read i18n's public static `./config` through workspace discovery for locale policy.
Dev CLI owns ICU message comparison in `src/validation/catalog-parity.ts` and
uses the dev catalog's ICU parser. Keep the i18n runtime out of its dependency closure.
Dev CLI uses `vp test` with four isolated file workers and a 30-second test timeout.
Its scripts select layers through Vitest filters.
Root `vite.config.ts` discovers workspace configs as native Vitest projects from
package.json workspaces. `test.config.ts` is a plain defaults object;
workspace configs use native `defineConfig`/`mergeConfig`
and own their include patterns, projects and overrides. Do not wrap Vitest options
in another factory or restricted interface. Scaffolded test workspaces include
source-adjacent tests and `tests/` fixtures in strict checking and merge these defaults in their own config.
`raypx-dev cli:experiment <prepared CLI directory> [--upx <executable>]` compiles
isolated size/startup candidates under `.artifacts/cli-size`, preserving the prepared
production payload. Its manual workflow uses Windows only.
Full verification builds the API/Web outputs and probes them concurrently under Bun using temporary
roots and fixture environments. Linux CLI probes use Docker `--network none` with the pinned
Bun image, read-only sources/payload and a writable report directory; already isolated
Linux namespaces run directly. Docker failure never falls back to the host.
`src/validation/toolchain.ts` reads the single Bun pin from
`packageManager` and rejects Node pins. These config/test entries never enter product runtime code.
Smoke orchestration and artifact probes live in
`src/smoke/`. Unit tests live beside source; integration tests stay in `tests/integration/`.
Keep scaffold and locale policy suites separate; shared temporary workspace fixtures
live in `tests/helpers/workspace.ts` and register cleanup for each suite.
The inventory regression requires a focused command for each active test layer,
rejects empty layer commands and `.only`, and keeps PostgreSQL/Redis and Playwright
outside ordinary test layers. Scaffolding with tests creates a strict default
runner; add focused commands when their first real suites exist.
Workspace scaffolding copies static configuration from `src/templates/workspace/`
into generated TypeScript paths. Every scaffold registers a lightweight task config.
Its `agents.ts` renders workspace instructions;
manifest and TypeScript configuration data use JSON serialization.

## Verification

Run `bun run --cwd packages/dev-cli test` and `check`, `bun bin/raypx-dev.mjs doctor`,
then `bun run policy`. Check the production-only filtered install when runtime
dependencies change.

`analytics sourcemaps <web|desktop>` prepares existing client
artifacts with the external PostHog CLI. Require release credentials and hidden
maps, upload before deleting maps, and never rebuild before deployment. The build
helper exposes only public release metadata and the hidden-map flag. Resolve release
once (explicit VITE_APP_RELEASE, Railway SHA, Git SHA), write client metadata during
the build, and upload using that recorded release; never infer upload versions from
the current checkout. Reject conflicting overrides before modifying assets.
