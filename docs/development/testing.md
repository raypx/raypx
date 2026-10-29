# Verification

Run narrow meaningful workspace tests, then bun run verify. The default gate checks
catalog parity, workspace/platform rules, format, lint, types, unit/component tests,
builds, relocated API and Web SSR outputs started with Bun,
and the compiled CLI. It requires no database,
GUI or mail provider. Test runners share test.config.ts and remain plugin-independent.
Verification schedules lint, checks, tests and builds in one VP graph. Desktop's
SDK preparation runs once as an uncached dependency; checks fingerprint its generated
files after preparation. Application task configs never load the SDK or Vite app
plugins, so pure package tests work after clean. Outcome-affecting fields are declared
in each task's `cache.env`; `untrackedEnv` preserves the inherited environment.
Browser argument
payloads are scoped to the uncached browser leaf. Build outputs are explicit, and
Vitest/Vite temporary caches are excluded from task input/output tracking.
Tooling's full suite includes independent VP cache fixtures and always executes:
VP's filesystem tracer cannot be nested on macOS. `raypx.uncachedTasks: ["test"]`
records this exception; its unit-only suite and other workspaces retain caching.

## Daily feedback and machine load

The root test entry is `bun run test [suite]`; each package keeps independent
scripts. See [test commands](test-commands.md) for package selection, local entry
points and the migration from root `test:*` aliases. Use `bun run test list` to
discover supported layers instead of maintaining a package-name list.

Use `bun run verify` for daily feedback: policy and locales are always checked;
changed files select formatting/lint, affected workspace types/tests, and necessary
Go host tasks through reverse dependency graphs. The default base is the merge-base
with `origin/canary`; staged, unstaged, untracked, renamed and deleted files count.
Use `--base <ref>` to change it or `--dry-run` to inspect the JSON plan.
Unknown inputs, shared configuration/lockfiles, or an unavailable base select full coverage.
Frontend files whose declared `raypx` target is `browser` reach only workspaces that contain
browser code or import a browser entry, including type-only and test imports. If a workspace's
non-browser, non-test sources import browser code, its consumers are selected as before.

Use `bun run verify --full` before delivery. It checks all JS and current-platform
Go host targets, builds outputs and runs independent artifact probes concurrently.
It needs no GUI, database or mail service. The repository uses Bun for JavaScript
and Go 1.27.3 for Desktop; no Rust toolchain is needed. `verify` and `verify --full`
are the verification entry points.

GitHub uses the same change planner. JS, database, browser and native gates run in
parallel when relevant; Desktop/CLI dependencies retain both native platforms. Native gates
skip changes that reach Desktop only through its browser renderer, which they never exercise.
Tags and manual dispatch select full source coverage. `foundation` requires every selected
gate to succeed and permits only intentional skips. Herdr integration and pinned Go checks run in the native check phase. Go caches
are separate from VP's JS task cache; smoke and production use separate outputs.

The check phase stages a matching CLI, runs Herdr and executes Go source checks on both platforms.
Routine checks run Herdr once; distribution runs repeat it three times on Windows
without blocking the parallel package/smoke phases.
Installer creation, signatures and installed GUI smoke run on tag pushes or manual
dispatch with the `distribution` checkbox enabled (`gh workflow run ci.yml -f distribution=true`).
Those runs require Go checks, production packaging and packaged GUI smoke in parallel.
Manual distribution runs have their own cancellation group, so routine pushes cannot
cancel a release acceptance run.
Distribution runs prepare shared JS inputs once per platform; that job alone saves VP artifacts
and the parallel phases only restore them. Routine runs skip preparation, so the lone check
phase builds and saves its own inputs. Verification, test and E2E tasks receive the fixed
`VITE_APP_RELEASE=verification`, so a new commit does not invalidate unchanged tasks. Native Go
compilation uses the Go cache and independent production/smoke package directories.
Generated route trees and native JSON use LF on every checkout so Windows generators do not
invalidate restored tasks. MyGo produces per-user NSIS installers for production and smoke. Smoke still installs the NSIS package and verifies payload hashes.
CI selects Go through apps/desktop/go.mod and keys its native cache with go.sum.
Windows jobs install Bun packages from the registry instead of restoring the download cache;
extracting its many small files took longer than a fresh frozen install.
The browser job caches Playwright's Chromium headless shell by Playwright version and runs
`playwright install-deps` only when `ldd` reports a missing system library.
Timing and scope for local verification are recorded in `.artifacts/verification/latest.json`.
The root launcher defaults to two workspace tasks. Shared Vitest defaults use one
worker and per-file isolation; larger suites set their worker count locally.
CLI, Desktop and Tooling also own their subprocess test timeouts locally.
Override task concurrency with `--concurrency-limit=1`
or `VP_RUN_CONCURRENCY_LIMIT`. A single direct runner can still use
`bun run --cwd packages/ui test --maxWorkers=2`.

```sh
bun run test --filter=@raypx/ui
bun run test '--filter=...@raypx/ui'
bun run raypx-dev tasks @raypx/ui#test -- --testNamePattern keyboard
bun run raypx-dev tasks desktop#build --dry-run
bun run test --verbose
```

Qualified `package#task` references accept scoped arguments after `--`. When forwarding
arguments with a filter, use a qualified reference to avoid changing dependency tasks.
`--dry-run` prints a dependency plan without executing tasks. VP uses private `task:*`
names so package scripts remain independently runnable without task/script conflicts.
There is no second scheduler. `vp run --filter @raypx/ui task:test` is the equivalent
native task entry; `vp run test` at root enters the normal root launcher.

VP records local results in `node_modules/.vite/task-cache`. Use `--verbose` or
`vp run --last-details` for cache misses and task timings. Cached logs describe an
earlier execution; their test durations are not the current command's elapsed time.
Keep the cache between runs. `bun run clean` removes task/transform caches while
preserving dependency packages, sources and local user data.

The root `dev` entry selects Web and API and allows three task slots. Preparation
and compilation dependencies complete before the long-running dev commands start.

## Test locations

Reusable validation and evidence cleanup are documented in
[validation artifacts](validation-artifacts.md): `test inventory`, `test backends`
and `clean:artifacts`. Scripts belong in Tooling; `.artifacts/` holds generated output only.

Every workspace keeps test suites, test-only setup and fixtures under `tests/`.
Use directories for test kind: Web has `tests/unit/` and `tests/component/`,
UI has `tests/component/`, and Tooling has `tests/unit/` and `tests/integration/`.
Tasks owns its pure `tests/unit/` and shared `tests/component/` views (composer,
conversation, observed requests, workspace). Web/Desktop retain application auth,
routes and IPC adapters. Host owns loopback relay `tests/integration/` for renewal,
replay and snapshots, with fresh transport/storage resources per case.
Keep filenames focused on the subject (`auth.test.tsx`, `cache.test.ts`).
The `test:unit`, `test:component` and `test:integration` scripts select these directories.
Declare a focused command when that layer has real suites; empty placeholder gates
are rejected by Tooling's inventory test. A new scaffold with test support fails
until actual cases are written. The inventory check also rejects committed `.only`.
Desktop separates `tests/renderer/`, `tests/native/` and `tests/scripts/` and checks
each against its platform types. Renderer suites use `unit/` and `component/`
subdirectories. Native policy, subprocess and OS-lock tests now live in
`apps/desktop/tests/native/host/` and run with Go; the deleted Bun native
integration layer has no placeholder `test:integration` script.
Scripts select directories independently of the `.ts`/`.tsx` extension.
Development and packaging scripts live under `apps/desktop/scripts/native/`.
The packaged smoke runner and scenario live in `tests/native/smoke/` outside the default suite.
CLI suites separate `tests/unit/` and `tests/integration/`, then group by capability.
Agent lifecycle/approvals, input races and context/resume have separate suites sharing
per-case host fixtures. Their real ten-second deadline tests remain in integration;
injected Pi cases separate lifecycle, tool durability and completion in unit.
standalone artifact and PTY smoke gates live in `tests/smoke/`. CLI and Tooling shared fixtures
live in their own `tests/helpers/` and own temporary resource cleanup.
E2E server launch helpers live in `e2e/tests/helpers/`.
Ordinary browser cases are grouped by access, auth, settings, navigation, analytics
and feature journeys; task conversation/history/drafts live under `e2e/tests/tasks/`.
See [case ownership and consolidation](test-cases.md) for the coverage map and rules
for combining cases without replacing independent safety or platform checks.
i18n separates `tests/node/` from `tests/browser/` to preserve independent React
renderer environments, with provider components under `tests/browser/component/`.
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

API tests use `apps/api/tests/unit/` and `tests/integration/` for the default gate.
`test:unit` and `test:integration` select these directories. Database suites live
under `tests/postgres/node/`, selected only by the `postgres` mode in
`vitest.config.ts`.
The existing script names select the mode; the default test command never connects to a database.
Database seeding and behavior assertions stay in each suite.

## Unused code checks

Run `bun run knip` for the full report. `knip.json` declares Vite app configs,
spawned fixtures, native smoke entries, type assertions and command-loaded tools
as entries. Drizzle config is analyzed statically, without loading database
credentials. The Vitest scaffold is a static `.template` file copied into each new
workspace, so its workspace-relative imports need no Knip resolution exception.
Keep unused-export findings visible for review. Knip currently misses Bun's
`overrides` catalog references for `esbuild`, `jiti` and `lightningcss`; preserve
those entries. Workspaces inheriting the shared coverage configuration declare
`@vitest/coverage-v8` directly, including those forwarding `--coverage` to `test`.

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
  Release acceptance additionally verifies views://main session persistence on macOS
  WebKit/Windows CEF against HTTPS auth, bundled CLI resolution/version, picker grants,
  tray scheduling, restart, EOF/quit cleanup and PTY resize/cancellation.

### Faster browser feedback

The complete browser gate remains `bun run test e2e`, with all ordinary assertions.
CI defaults to three workers. Local hosts with at least eight available CPUs and
16 GiB of total memory default to four; smaller hosts use one or two. Explicit
Playwright flags override the default. Select a surface or a smaller smoke set:

```sh
bun run test e2e --web
bun run test e2e --desktop
bun run test e2e --smoke
bun run test e2e -- --workers=2
bun run test e2e --web -- --grep template
bun run test e2e --desktop -- 'access|memory'
bun run raypx-dev e2e --web --smoke -- --list
```

The smoke set covers guest boundaries/draft restoration, shared task/approval
interaction and both memory flows. Surface, smoke and user grep filters intersect;
they do not replace one another. Pass Playwright flags or filenames after `--`.
Use `bun run raypx-dev e2e --web --dry-run` to inspect the VP dependency plan.
Focused runs are feedback tools; run complete acceptance before release.

Playwright filenames, workers, trace and reporter arguments travel through a scoped
JSON environment field to the uncached browser leaf. They are not dependency passthrough
arguments: changing a test selection must not invalidate Web/Desktop builds or
their type checks. Application source, build variables and runtime pins still
participate in the normal build hashes. See the [case timing record](test-cases.md).

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
Vite mode `e2e`; it excludes Native SDK preparation, CLI compilation and Native
checks. Its Native bridge fails with `DESKTOP_REQUIRED`, so this output cannot
simulate successful IPC. Normal Desktop builds and packaging still use the real
SDK and `dist`, and `bun run verify` retains strict Native checking and artifact
probes. The browser-only output is ignored, cached separately and removed by
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

Browser E2E, including `e2e:live`, defaults to headless. Add `--headed` only when
interactive browser debugging is wanted. Native smoke defaults to quiet presentation:
windows use `activate: false` and `showInactive()`, and system notifications/dialogs
are suppressed. Display/hide and visibility-based approval leases still run; native
close, resize and foreground activation checks are explicitly skipped. Quiet smoke
fails if it observes its test window gaining focus. This is not a fully headless
native renderer: a test window can still be visible behind the current application.

```sh
bun run --cwd apps/desktop native:smoke
# Explicit foreground GUI acceptance, when it will not interrupt development:
bun run --cwd apps/desktop native:smoke:interactive
# HTTPS native acceptance can also opt in explicitly:
bun run --cwd apps/desktop native:beta --interactive
```

`RAYPX_NATIVE_SMOKE_UI=interactive` is the equivalent explicit environment option;
the presentation override applies only with `RAYPX_NATIVE_SMOKE=1`. Foreground,
minimization and OS-notification acceptance belong on an independent GUI runner or
an explicit interactive session; a quiet run does not establish those capabilities.

`native:smoke` also switches the same packaged renderer between two loopback
origins using TOML, then switches back. It checks native cookie and WebView-storage
isolation, remote opt-in isolation, restoration of the original server state,
and preservation of device preferences and local file/job state.

## DOM matchers with the hoisted install

Register @testing-library/jest-dom/matchers using expect.extend on the expect
exported by vite-plus/test. Keep the jest-dom/vitest import type-only for assertion
augmentation; its runtime side effect can extend a different auto-installed Vitest
peer. Independent runner setup files preserve the shared Bun/jsdom preload.

## Independent terminal host

The [P1 host guide](terminal-host-p1.md) documents the isolated real Claude/Codex
terminal-to-Web gate, daemon lifetime and capability restrictions. It complements
the HTTPS Beta gate rather than replacing it. Default tests cover private IPC,
GUI-client disconnect, retention and Native authorization fences. `native:smoke`
also probes the daemon after actual GUI Quit and explicitly stops its isolated
owner at cleanup. Production service installation and iOS are separate gates.

## MyGo Desktop migration gates

`native:smoke` builds a separate release application with the `native_smoke`
Go build tag, then drives the existing TS assertions through a token-authenticated
Unix socket or Windows named pipe. `native:smoke:interactive` additionally exercises
foreground close/focus/minimum-size behavior. The normal release has no smoke
listener or eval commands; the post-package gate matches the actual binary to its
Go module/build metadata and checks that no native-smoke socket marker is present.
Go retains the shared config/Cookie/API/local-method JSON fixtures. Renderer
tests verify the TS contract and preference validation, including the raw preload
regression executed by Go through a Bun fixture.
Native application tests run separately in the macOS/Windows CI matrix. Default
Bun verification builds renderer assets without preparing a native SDK. Local
automation stays quiet; foreground close/focus/minimum-size checks run on isolated
GitHub runners. Windows CI silently installs the smoke NSIS package into an owned
temporary directory, runs its actual installed main executable and CLI through
every phase, then uninstalls and verifies cleanup.

Release signing and real HTTPS/live-agent acceptance require their explicit CI
secrets or isolated acceptance environment. A successful unsigned local bundle does
not establish notarization, Windows WebView2 behavior or live-provider acceptance.
See [ADR 0038](../architecture/0038-mygo-desktop-host.md).
