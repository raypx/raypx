# Testing and verification

Run focused workspace tests, then `bun run verify` for daily delivery. It checks
policy/locales, changed-file format/lint and affected types/tests; native inputs
add current-platform Go checks. `bun run verify --full` adds repository audits,
builds and relocated artifact probes for release preparation. Neither command
replaces separate database, browser, installed native or live-provider acceptance.

`bun run verify --no-cache` forwards VP's cache control for container filesystems.
Linux CLI artifact probes automatically run the prepared payload in Docker with
`--network none`, using the Bun image pinned by `packageManager`. The repository and
payload are read-only; only `.artifacts/cli` reports are written back. Host environment
variables are not forwarded and Bun's env-file loading is disabled. A namespace that
already has only loopback addresses runs directly, so full verification inside an offline container needs no
nested Docker. Direct `apps/cli` smoke still requires that isolated namespace.
The four SDK probes fail when outbound network isolation cannot be established.

## Test commands

Root commands discover scripts from workspace manifests; each workspace owns its
actual suites. Ordinary Vitest tests need no database, GUI or provider login.

```sh
bun run test --help
bun run test list
bun run test
bun run test unit
bun run test component
bun run test integration
bun run test coverage
```

### Independent packages

```sh
bun run --cwd packages/tasks test
bun run --cwd packages/tasks test:unit
bun run --cwd packages/tasks test:component
bun run --cwd apps/api test
bun run --cwd apps/api test:postgres
bun run --cwd apps/api test:redis
bun run --cwd apps/api test:cluster
```

`test:cluster` requires both `TEST_DATABASE_URL` (an isolated database ending in
`_test`) and `TEST_REDIS_URL`. It checks multi-instance Relay with real sockets.
`test backends` and the CI backend gate include it.

Only layers with actual suites get scripts. Root selection accepts the full name,
workspace path or an unambiguous directory name. Running `raypx-dev test` within a
workspace also selects that workspace automatically.

```sh
bun run test --package @raypx/tasks
bun run test component --package tasks
bun run test unit --package packages/tasks -- --testNamePattern conversation
bun run test --filter=@raypx/ui
bun run test '--filter=...@raypx/ui'
```

Use `--package` when forwarding runner arguments to one package. Existing VP
filters remain available for graph selections; do not combine them with `--package`.
VP options go before `--`; filenames, reporters and other runner arguments go after.
Package-local scripts call Vitest directly and accept runner arguments directly.
Use the root entry with `--package` for VP controls such as `--dry-run` and `--no-cache`.

Each workspace's `vitest.config.ts` merges the plain defaults from `test.config.ts`
with native `defineConfig`/`mergeConfig`. Test selection and customization stay local;
multi-environment packages declare native `projects` and select them with `--project`.
Focused scripts name their actual test directories or projects and fail when empty.
Coverage scripts use `--coverage`; reporters default to text, JSON and LCOV and can
be customized in the owning workspace without changing a shared option schema.

### Browser and repository workflows

```sh
bun --cwd e2e --bun playwright install --only-shell chromium
bun run test e2e --package web --smoke -- --workers=1
bun run --cwd e2e e2e
bun run --cwd apps/web e2e -- settings.spec.ts
bun run --cwd apps/desktop e2e -- --grep template
bun run --cwd e2e e2e --web --dry-run

bun run test inventory --layers
bun run --cwd packages/tooling test:inventory
bun run --cwd packages/tooling test:backends
bun run test backends --with-e2e -- --workers=1
```

Browser commands use the same scoped arguments and build plan from root, `e2e/` or
the selected application. Root `--package` resolves workspace names and paths.
Private `_e2e` scripts are terminal runners for VP, not public entry points.
`raypx.taskScripts` connects each public command to a real private script, rejecting
chains or missing targets so a direct command cannot recursively enter its own graph.

Inventory and isolated-backend orchestration belong to Tooling and stay repository-wide,
even when launched from that package. Baseline/mapping filenames resolve against
the caller's current directory. Prerequisites, generated reports and cleanup are in
[validation artifacts](validation-artifacts.md). Live inference remains a separate,
explicit `bun run --cwd apps/desktop native:agents` gate with its existing prerequisites.

## Daily acceptance

| Change                                                                            | Daily acceptance                                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Documentation                                                                     | Changed-file formatting and repository policy; no workspace/native suites           |
| Go sources or Desktop Go module dependencies                                      | Go host checks/tests and relevant native CI acceptance                              |
| Workflow orchestration                                                            | Tooling checks/tests and the workflow's relevant acceptance                         |
| JS/React business code                                                            | Affected workspace types and unit/component/integration tests                       |
| Shared JS dependency/configuration                                                | All workspace source checks/tests; no release builds or native runners              |
| API or its affected libraries                                                     | Source checks/tests plus PostgreSQL/Redis integration                               |
| Native host, IPC contracts, native resources/scripts, CLI terminal/daemon/process | Go checks and relevant macOS/Windows native checks                                  |
| Browser acceptance tests themselves                                               | Browser acceptance, to validate the changed suite                                   |
| Release preparation                                                               | Full source/build/audit checks plus separate database/browser/native platform gates |

Source-only daily checks and CI gates have different prerequisites. The
[validation guide](validation-artifacts.md#verification-planning-and-cache) covers
selection, CI plans, native platform matrices, task caches and machine load.
Report unavailable or unrun platforms explicitly.

## Test locations

Reusable validation and evidence cleanup are documented in
[validation artifacts](validation-artifacts.md): `test inventory`, `test backends`
and `clean:artifacts`. Scripts belong in Tooling; `.artifacts/` holds generated output only.

Unit suites live beside source as `*.test.ts(x)`. DOM suites use
`*.component.test.ts(x)`; the suffix selects their layer independently of syntax.
Tests focused on one source module stay beside it, including tests that use small
temporary filesystem fixtures. Multi-component runtime and service scenarios belong in integration.
Integration suites, shared setup and fixtures stay in `tests/`; application browser
acceptance lives in `apps/web/e2e/` and `apps/desktop/e2e/`.
Tasks owns pure tests beside its model and component tests beside shared views
(composer, conversation, observed requests, workspace). Web/Desktop retain application auth,
routes and IPC adapters. CLI owns loopback relay `tests/integration/` for renewal,
replay and snapshots, with fresh transport/storage resources per case.
Keep filenames focused on the subject (`auth.test.tsx`, `cache.test.ts`).
The `test:unit`, `test:component` and `test:integration` scripts select these layers.
Declare a focused command when that layer has real suites; empty placeholder gates
are rejected by Tooling's inventory test. A new scaffold with test support fails
until actual cases are written. The inventory check also rejects committed `.only`.
Desktop colocates renderer and native-script tests with source and checks each
against its platform types. Route composition suites stay beside the router,
outside `src/routes/` discovery. Desktop uses native Vitest projects: `unit` for
source and script policies/adapters, `component` for DOM interactions, and `integration` for
native build/package cases in `tests/integration/native/`. `test:unit`, `test:component` and `test:integration`
select exactly those projects; default `test` aggregates them. Unit and component
cases use per-case typed DesktopPlatform fixtures, with no CLI, Go, WebView,
system secrets or installed Provider. Unhandled fixture requests fail explicitly.
Go's pure policy and injected-engine cases live in `internal/desktop`; real
subprocess, IPC, OS-lock and compiled CLI tests remain in `tests/native/host`.
Scripts select directories independently of the `.ts`/`.tsx` extension.
Development and packaging scripts live under `apps/desktop/scripts/host/`.
The packaged smoke runner and scenario live in `tests/native/smoke/` outside the default suite.
CLI unit suites live beside source; `tests/integration/` stays grouped by capability.
Agent lifecycle/approvals, input races and context/resume have separate suites sharing
per-case host fixtures. Their real ten-second deadline tests remain in integration;
injected Pi cases separate lifecycle, tool durability and completion in unit.
Standalone artifact and PTY smoke gates live in `tests/smoke/`. CLI and Tooling shared fixtures
live in their own `tests/helpers/` and own temporary resource cleanup.
E2E server launch and response helpers live in `e2e/tests/helpers/`.
Application-specific cases live in each application's `e2e/` directory. Shared
analytics, navigation, memory, cloud schedules and task journeys are registered from
`@raypx/e2e/journeys/*` by small application-owned spec files. Their assertions live
once in `e2e/tests/journeys/`; `surface` and `base` fixtures come from the selected
Playwright project. Application fixtures use the public `@raypx/e2e/testing` entry.
The root config defines `web` and `desktop` projects with separate test directories.
`bun run test e2e -- --list` lists the complete ordinary inventory without builds
or servers; fixed counts are not an ownership contract.

Combine cases only within one coherent journey. Keep independent failures, account
boundaries and platform checks identifiable. Browser response fixtures do not prove
real authentication or native IPC, and each case gets fresh context and resources.

i18n separates pure/SSR tests from `*.component.test.tsx` through Vitest projects
to preserve independent React renderer environments.
DOM tests run in happy-dom. The shared setup in `packages/tooling/tests/setup/dom.ts`
disables Base UI animation waits and keeps Web Storage methods on `Storage.prototype`
so existing spies behave as in a browser. Web, Tasks and i18n declare native Vitest
`projects` with `extends: true`, keeping their pure and DOM environments separate.

Root `test.config.ts` exports a plain config with runtime defaults, shared setup and
coverage reporters. Each workspace owns its test includes and combines local options
with native `mergeConfig` and `defineConfig`. Add aliases, timeouts, plugins, setup
or coverage settings directly in that workspace's `vitest.config.ts`; no shared
factory or custom option interface needs to change. Native config merging also
preserves shared React deduplication when a workspace adds aliases.

API tests use source-adjacent `server/**/*.test.ts` and `tests/integration/` for the default gate.
`test:unit` and `test:integration` select these layers. Database suites live
under `tests/postgres/node/`, selected only by the `postgres` mode in
`vitest.config.ts`.
The existing script names select the mode; the default test command never connects to a database.
Database seeding and behavior assertions stay in each suite.

### DOM matchers with the hoisted install

Register @testing-library/jest-dom/matchers using expect.extend on the expect
exported by vite-plus/test. Keep the jest-dom/vitest import type-only for assertion
augmentation; its runtime side effect can extend a different auto-installed Vitest
peer. Independent runner setup files preserve the shared Bun/happy-dom setup.

## Explicit gates

- TEST_DATABASE_URL pointing to an isolated *_test database, NODE_ENV=test:
  bun run test postgres validates full verification/login/reset/session revocation.
  CI uses PostgreSQL 17; an older local server is reported separately.
- `TEST_REDIS_URL` pointing to a disposable Redis or Valkey (`docker compose up -d valkey`
  serves `redis://localhost:6380`): `bun run test redis` checks the session cache,
  fixed-window counters and concurrent RPC limits. Keys use a unique, expiring prefix.
- bun run test e2e runs real Chromium Web/Desktop-renderer acceptance. Install
  Chromium first. Browser preview cannot validate native process access or cookies.
- bun run package:desktop on macOS and Windows checks the actual native package.
  Release acceptance additionally verifies daemon-owned encrypted session persistence
  against HTTPS auth, scoped MyGo browser storage on WKWebView/WebView2, matching
  bundled CLI resolution, picker grants, daemon scheduling/task survival after GUI
  Quit, explicit daemon shutdown and PTY resize/cancellation. Renderer previews
  cannot establish these native results.

### Faster browser feedback

The complete compiled-artifact gate remains `bun run test e2e`, with every ordinary
assertion. For daily work, select the owning application before building or serving:

```sh
bun run --cwd apps/web e2e
bun run --cwd apps/desktop e2e -- settings.spec.ts
bun run test e2e --package web -- --grep template
bun run test e2e -- --project=desktop
bun run test e2e --web --smoke
bun run test e2e --package desktop -- --list
bun run test e2e --package web --dry-run
```

Package names/paths, local application scripts, `--web`/`--desktop` and native
Playwright `--project=web|desktop` select the same build and server scope. Conflicting
selectors fail before running. Projects select application cases; smoke and user
grep intersect within that project. Pass filenames or Playwright flags after `--`.
Listing cases bypasses VP builds and Playwright does not start servers. Focused
runs are feedback tools; run complete acceptance before release.

CI defaults to two workers. Local hosts with at least twelve available CPUs and
32 GiB of total memory default to eight; eight CPUs and 16 GiB use four; smaller
hosts use one or two. Explicit `--workers` wins. Every case keeps its own browser
context, account and response fixtures.

The conversation browser journey loads at most 200 messages in total: 100 initial
messages, 50 older messages, 49 gap messages and one new message. Fourfold Chromium
CPU throttling makes delayed virtual-row measurements observable with this bounded
fixture. It checks the DOM bound, focus, virtual/full-text switching, message revisions
and explicit loading of earlier and missing messages.

Web's cached `build:e2e` uses the production Nitro Bun build command. It omits the
normal build's type-check prerequisite; `apps/web check` and `bun run verify` still
check both application and E2E sources. Desktop uses its cached `build:renderer`
task. Test-only edits and Playwright selections must not rebuild unchanged product
artifacts. The uncached browser leaf receives test filenames, grep, worker, trace
and reporter arguments through scoped JSON, outside dependency fingerprints.
Application source, build variables and runtime pins remain build inputs.
Application CSS explicitly excludes `e2e/**` from Tailwind class scanning. The
compiled-style check seeds a test-only utility and rejects it in generated CSS,
so browser fixture edits cannot leak styles into product builds.

Playwright owns its loopback servers and fails on an occupied port. It never
reuses an unrelated or stale server. Web/Desktop/all runs use separate report
folders under `e2e/test-results/`; CI uploads that tree on failure.

Successful runs skip manual full-page screenshots and local traces. Failure
screenshots remain enabled; CI records traces on the first retry. Capture the
existing theme, locale and feature screenshots explicitly, or record a local trace:

```sh
bun run test e2e --visual
bun run raypx-dev e2e --desktop --visual -- --grep template
bun run test e2e --web -- --grep template --trace on
```

Each mode builds only its required surfaces, using synthetic analytics settings
and the running Bun executable. Desktop browser acceptance builds `artifacts/browser` in
Vite mode `e2e`; it excludes MyGo preparation, CLI compilation and Go
checks. Its Native bridge fails with `DESKTOP_REQUIRED`, so this output cannot
simulate successful IPC. Normal renderer builds use `dist/client`; packaging embeds that output with
the compiled CLI and Herdr. Daily `bun run verify` selects native checks only for
native inputs; `verify --full` adds builds and artifact probes. The browser-only output is ignored, cached separately and removed by
`bun run clean`. Live backend/inference acceptance keeps its separate opt-in config.
The Desktop acceptance server reads that compiled client directory directly;
startup no longer loads Vite plugins or application configuration. It retains
HTML/CSP and asset bytes, supports SPA deep links and rejects backend paths,
missing assets and files outside the client directory. Web still runs its real
compiled SSR server under Bun.

### Live AI and Beta-to-Desktop acceptance

These opt-in checks invoke the configured real Claude Code and Codex CLIs and consume
provider usage. Default verification uses subprocess fixtures and never invokes them.

Build the CLI, then run `RAYPX_LIVE_AGENTS=1 bun run --cwd apps/desktop native:agents`.
The gate creates temporary projects and uses Desktop's actual LocalEngine transport
with the standalone executable. It verifies file reads, plan rejection and approval,
generated `node:test` suites run by `bun test`, provider session resume across an engine restart, and cancellation
of a running child process. `RAYPX_LIVE_KEEP=1` retains its temporary evidence directory.

For a real HTTPS environment, provision a dedicated verified `@raypx.example.test`
account. Store `{ "email": "…", "password": "…", "userId": "…" }` in a private local
file, never in source or command arguments. Use a fresh temporary native data directory.
Build Desktop normally. Native reads its API and Web origins from runtime TOML;
no environment-specific package or `runtime-config.json` is required.

Set `RAYPX_LIVE_AGENTS=1`, `RAYPX_NATIVE_SMOKE_API`,
`RAYPX_NATIVE_SMOKE_CREDENTIALS` (the private file), and
`RAYPX_NATIVE_SMOKE_DATA_DIR`, then run `bun run --cwd apps/desktop native:beta`.
The runner creates `config/config.toml` under that isolated data directory using
the supplied API origin, without reading or changing the user's `~/.raypx` file.
After `native-ready.json` appears, set `RAYPX_LIVE_WEB_URL` to the same origin and
run `bun run --cwd e2e e2e:live` with the same native directory and credentials.
The isolated headless browser signs in, creates both providers' tasks, checks no
project writes occur before approval, approves through Web, verifies real files
and returned results, and reloads the persisted task list. During a pending task,
Native renews its real grant while hidden and reconnects without cancelling it.
No mock API, simulated device, credential override or disabled browser security
is used by this gate. Traces are off to avoid capturing login request bodies.

Web writes `web-complete.json`; the native gate checks local files and its actual
remote-task renderer. It then restarts the packaged process, checks the real session
and relay reconnect, and verifies logout clears the session and detaches the device.
The receipts are `native-complete.json` and `native-restore-complete.json`.
Remove only the dedicated account and its test records after acceptance; preserve
other environment data. Real macOS success does not establish Windows HTTPS behavior.

Never replace production cookie security with trusting null origins or disabling
web security. Do not count browser-preview tests as packaged-platform passes.
Unavailable platform checks remain open release gates, with their reasons reported.

Browser E2E defaults to headless. Add `--headed` only when
interactive browser debugging is wanted. Native smoke defaults to quiet presentation with inactive windows and suppressed
notifications/dialogs. Display/hide and visibility-based approval leases still run; native
close, resize and foreground activation checks are explicitly skipped. Quiet smoke
fails if it observes its test window gaining focus. This is not a fully headless
native renderer: a test window can still be visible behind the current application.

```sh
bun run --cwd apps/desktop native:smoke
# Explicit foreground GUI acceptance, when it will not interrupt development:
bun run --cwd apps/desktop native:smoke:interactive
```

`RAYPX_NATIVE_SMOKE_UI=interactive` is the equivalent explicit environment option;
the presentation override applies only with `RAYPX_NATIVE_SMOKE=1`. Foreground,
minimization and OS-notification acceptance belong on an independent GUI runner or
an explicit interactive session; a quiet run does not establish those capabilities.

`native:smoke` also switches the same packaged renderer between two loopback
origins using TOML, then switches back. It checks native cookie and WebView-storage
isolation, remote opt-in isolation, restoration of the original server state,
and preservation of device preferences and local file/job state.

## Independent terminal host

The [terminal host guide](terminal-host.md) documents the isolated real Claude/Codex
terminal-to-Web gate, daemon lifetime and capability restrictions. It complements
the HTTPS Beta gate rather than replacing it. Default tests cover private IPC,
GUI-client disconnect, retention and Native authorization fences. `native:smoke`
also probes the daemon after actual GUI Quit and explicitly stops its isolated
owner at cleanup. Production service installation and iOS are separate gates.

## Native release acceptance

See [Desktop build and release](desktop.md#build-and-release) for platform
requirements, native-smoke isolation, installed package checks and signatures.
Browser preview establishes compiled web behavior only. MyGo transport tests run
through `mygo:test`; native smoke and interactive acceptance remain explicit.
