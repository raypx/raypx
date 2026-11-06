# @raypx/tooling

## Purpose

Private repository automation exposed as raypx-dev. VP owns task orchestration;
`@raypx-kit/devkit` owns workspace discovery, boundary and toolchain checks, the static
catalog reader, task graphs/arguments/cache snapshots, affected workspace propagation,
scoped Start environment inputs, process helpers and artifact staging. This package supplies Raypx
conventions (`src/repository.ts`), policy, locale parity, scaffolding and product probes.

## Interface

`bin/raypx-dev.mjs` is the executable entry. It loads `src/cli.ts` through the
package's `tsx/esm/api`; callers need Node, with no global tsx executable.

- raypx-dev tasks <task> [VP options]
- raypx-dev test [suite] [--package name|path] [VP options] [-- runner arguments]
  Root owns this aggregate; package scripts own actual suites. `test list` discovers
  capabilities. Tooling owns test:inventory/test:backends; E2E owns browser gates.
- raypx-dev e2e [--package web|desktop] [--web|--desktop] [--smoke] [--visual] [--dry-run] [-- Playwright flags]
- raypx-dev workspace list | new <name> --kind library --target universal [--write]
- raypx-dev policy | knip | verify | doctor | clean | clean:artifacts
  `policy` also checks public entries (`src/validation/entries.ts`): every exports key
  of a library or tooling workspace needs an importer in another workspace, found in
  TS/TSX/MTS imports, CSS `@import`/`@source` and tsconfig `extends` (root config
  included). Suites, `tests/` files and `e2e` are test importers: they keep `./testing*`
  entries and tooling surfaces alive; other entries need production use. `raypx.entryConsumers` is the declared-exception escape hatch and is
  validated against the exported keys.
- raypx-dev test:inventory [--layers] [--baseline file] [--owners file]
- raypx-dev test:backends [--with-e2e [-- Playwright flags]]
- raypx-dev size [--package name|path] [--native] [--browser] [--require]
  Discovers buildable workspaces, measures existing deployable directories and CLI
  runtime components, and writes JSON/Markdown under `.artifacts/sizes/`. Native
  mode adds actual production bundles/installers; browser mode selects Desktop's
  compiled browser fixture. Missing outputs are unavailable; `--require` rejects them.
  CI appends tables to its summary after selected builds/cache restoration and uploads
  reports. Sizes count regular files, excluding symlinks; components/bundles overlap
  and must not be added together. Measurement never launches a build or smoke task.
- `raypx.taskScripts` delegates a public package script to a terminal runner inside
  VP's leaf. Validate both names, refuse chains/cycles and retain public task argv.
- `clean:artifacts` removes reports, coverage, test-report caches and browser results,
  preserving builds, staged sidecars, dependencies and source. `clean` includes these paths.
- `verify` selects affected JavaScript source/tests and native-input Rust tasks; `verify --full` checks
  all current-platform JavaScript/Rust sources, builds and probes. `--base` selects a Git
  base; `--dry-run` prints the plan, local test selection/reasons and expanded VP graph.
  Local tests follow source imports, retaining integration and filesystem/process
  assertions; indirect consumers and unknown/configuration/deleted inputs use complete
  suites. CI and `--full` always run complete selected workspace suites. File arguments
  use the existing per-task argument keys, never aggregate dependency arguments.
  Private Tooling gates/tests select Tooling only; exported helpers follow their static
  entry dependencies and actual import consumers. Task machinery, unknown/deleted inputs
  and unresolved export graphs retain all source checks.
- CI consumes the same planner through private `ci:plan`/`ci:gate` entries. It emits
  one versioned plan bound to `GITHUB_SHA`; workers consume `RAYPX_CI_PLAN`
  instead of recomputing scope. `verification/gates.ts` owns CI gate registration and
  selection. The final gate rejects unregistered jobs, inconsistent plan outputs,
  failed/cancelled jobs and unexplained skips. Local evidence records running,
  passed or failed status so a failed run cannot retain a previous success.
  Shared or unknown inputs broaden source checks without requesting release builds/audits. Missing Git
  bases also select native checks conservatively. Browser-target frontend
  changes reach only browser consumers (`src/verification/platform.ts`). Required results
  distinguish intentional skips from missing/cancelled/failed gates. Deployment inputs,
  API/Web runtime dependencies and full release runs select an isolated Docker acceptance
  job for Compose and Railway. Source-only verify remains independent of Docker.
- Branch/PR native gates run only for native/IPC/terminal/daemon inputs, CLI runtime
  packaging helpers and their regressions, and select
  macOS/Windows by platform-specific filenames; shared native inputs select both.
  JavaScript dependency reach alone does not select native runners. Installers, signing and installed
  GUI acceptance require a tag push or manual `distribution` request; release gates
  run in parallel and the final result validates their selection against the event.
  Preparation builds shared JS inputs only. Herdr runs in the check phase before its
  Rust checks, leaving package/smoke phases independent of terminal-test duration.
- `clean` removes workspace outputs, staged Tauri resources/generated assets and local test artifacts;
  it awaits asynchronous deletion in batches of eight. Dependencies, lockfiles
  and persistent user/database data stay intact.
- raypx-dev env -- <command>, db <operation>, desktop build [Tauri build arguments]
- Desktop's default build/check only verifies the renderer and scripts. Explicit
  `native:build` and native smoke/agents tasks are uncached, depend on the
  renderer and matching CLI build, then stage the sidecar. `dev` stages that CLI
  before starting Vite and Tauri. Direct Desktop scripts enter the same VP graph.
  Native CI checks Rust on each platform.
- `./build/cli` packages the normal CLI JS artifact and stages Node/native resources only for Desktop.
- `./build/nitro` supplies shared Nitro Node build options to API and Web configs.
- `./build/deployment` owns service ports, health paths and API ingress routes.
  Policy checks static Docker, Compose and Caddy adapters plus API environment
  forwarding without importing application runtime or loading environment files.
- `raypx-dev deployment:smoke [--platform linux/amd64|linux/arm64]` builds both image
  profiles with an owned bounded builder, isolated temporary services and a synthetic
  API-owned account fixture. Share SSR/API assertions with relocated artifact probes.
  Always clean only owned resources; retain protected evidence under `.artifacts/deployment/`.

## Constraints

No product workspace imports this package at runtime. Do not import database, auth or
client implementations; delegate database commands to database's scripts. Derive all
workspace lists from manifests. Scaffolding previews by default and never overwrites.
Use platform-neutral filesystem/process APIs. Never print loaded secrets.
Generic checks belong in @raypx-kit/devkit; keep only Raypx-specific rules here.
Explicit full verification runs Knip; `pnpm run knip` remains available for maintenance.
Knip reads the native pnpm workspace catalogs and overrides directly; its JSON
report is validated without suppressing package-manager findings.
Native Rust-launched TS fixtures and the presets' dynamically invoked task leaf are
explicit Knip entries. Vendored skills are excluded;
Knip ignores the Tauri CLI and bootstrap tsx dependencies because native build scripts
and dynamic VP command strings invoke those binaries; they remain direct dependencies.
the root `skills` CLI is retained for the explicit `skills:update` maintenance command.
Reusable validation lives in `src/validation/`; `.artifacts/` contains generated
evidence only. Inventory compares case multiplicity and checks exact file selection.
Backend validation provisions only owned temporary services, resolves binaries from
PATH or explicit binary settings, and stops children before deleting their data.
Read i18n's public static `./config` through workspace discovery for locale policy;
do not add the i18n runtime to root tooling's dependency closure.
Preserve the shared happy-dom setup and independent workspace test runners.
The shared setup lives in `tests/setup/dom.ts`. Root `test.config.ts` is a plain
Vitest defaults object; workspace configs use native `defineConfig`/`mergeConfig`
and own their include patterns, projects and overrides. Do not wrap Vitest options
in another factory or restricted interface. Scaffolded test workspaces include
source-adjacent tests and `tests/` fixtures in strict checking and merge these defaults in their own config.
`./tasks` exposes Node-compatible, lightweight task configuration. Its model derives
all members and scripts from manifests, registers private `task:*` definitions and
explicit dependencies; VP alone schedules them. Leaf scripts stay available for
direct debugging. Leaves preserve Devkit's task argument keys and execute pnpm through
Runtime Node's cross-platform runner, retaining exit status, inherited streams and
interrupt forwarding on Windows command shims. Task definitions inherit the environment with `untrackedEnv`,
while outcome-affecting fields and per-task argument keys participate in fingerprints.
`raypx.uncachedTasks` opts specific scripts out. Tooling's complete test suite starts
independent cached VP runners, so it must run without an enclosing filesystem tracer;
`test:unit` remains cached and `test:integration` always executes.
Platform/toolchain identity is also part of each command. Native packaging stays
outside VP's filesystem tracer; Cargo owns its native compilation cache.
The launcher creates ignored artifact/native directories before tracing:
directory enumeration can otherwise invalidate JS tasks when those paths first appear.
Type checks explicitly fingerprint source/config files in the transitive workspace
dependency closure, retaining dependency declarations under build outputs; pnpm's
native typechecker reads are not fully covered by automatic tracing on Linux.
Workspace coverage and validation/browser reports are excluded across that closure;
authored source folders with the same names remain inputs. Root policy/locale tasks use
VP caching with explicit discovery/source/catalog/config inputs plus automatic tracing.
Policy/locales run in the same VP graph as source tasks and restore timing evidence
with their cached outputs. Verification records per-check execution times (zero on a
cache hit), format/lint wall times and VP graph wall time including runner overhead.
Timing evidence never controls cache reuse. Failed checks never publish success.
Full verification builds the API/Web outputs and probes them concurrently under Node using temporary
roots and fixture environments. `src/validation/toolchain.ts` checks the root Node range and pnpm pin,
native pnpm workspace configuration, Rust pin consistency and obsolete runtimes. These config/test entries never enter product runtime code.
`./browser-tests` combines browser surface/smoke/grep filters. Browser launchers
select synthetic analytics for every mode; live acceptance stays separate.
Browser argv travels through `RAYPX_E2E_ARGS` to the uncached `browser:run` leaf,
never dependency passthrough: test flags must not invalidate build/check dependencies.
Applications declare `raypx.browserTestProject` and delegate `e2e` to `_e2e`.
The root runs one shared Playwright process; local/package entries run one application.
Native `--project=web|desktop` selectors resolve before graph construction. `--list`
bypasses builds and servers. Web `build:e2e` compiles the production SSR artifact
without the normal build's type-check prerequisite; daily verification keeps checks.
The config uses eight local workers at 12+ CPUs/32+ GiB, four at 8+ CPUs/16+ GiB,
one or two on smaller hosts, and two on CI. Explicit Playwright flags win.
`./browser-server` serves only compiled Desktop client assets on loopback with
HTML deep-link fallback; never run Vite configuration or simulate backend/Native IPC there.
Smoke orchestration and artifact probes live in
`src/smoke/`. Unit tests live beside source; integration tests stay in `tests/integration/`.
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

Run pnpm --dir packages/tooling run test and check, then pnpm run policy.

`analytics sourcemaps <web|desktop>` prepares existing client
artifacts with the external PostHog CLI. Require release credentials and hidden
maps, upload before deleting maps, and never rebuild before deployment. The build
helper exposes only public release metadata and the hidden-map flag. Resolve release
once (explicit VITE_APP_RELEASE, Railway SHA, Git SHA), write client metadata during
the build, and upload using that recorded release; never infer upload versions from
the current checkout. Reject conflicting overrides before modifying assets.
