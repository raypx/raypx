# Verification

Run narrow meaningful workspace tests, then bun run verify. The default gate checks
catalog parity, workspace/platform rules, format, lint, types, unit/component tests,
builds, relocated Node API and Web SSR outputs, actual Cloudflare workerd outputs,
and the compiled CLI. It requires no database,
GUI or mail provider. Node 24.15.0 must be selected (or use
NODE_BINARY). Test runners share test.config.ts and remain plugin-independent.
Verification schedules lint, checks, tests and builds in one VP graph. Desktop's
SDK preparation runs once as an uncached dependency; checks fingerprint its generated
files after preparation. Application task configs never load the SDK or Vite app
plugins, so pure package tests work after clean. Outcome-affecting fields are declared
in each task's `cache.env`; `untrackedEnv` preserves the inherited environment.
The root launcher resolves `NODE_BINARY` before Bun can change PATH. Browser argument
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

Use `bun run verify:quick` for policy, formatting, lint, types and workspace tests.
`bun run verify` additionally builds both runtime targets and probes their artifacts.
Both gates include Rust formatting, Clippy, checks and tests. `verify` also builds
the Cargo workspace. Use `bun run rust:verify` for Rust-only feedback; see the
[Rust workspace guide](rust.md).
The root launcher defaults to two workspace tasks; each Vitest runner retains one
worker and per-file isolation. Override task concurrency with `--concurrency-limit=1`
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
subdirectories; native subprocess/OS-lock tests use `tests/native/integration/`.
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
The [2026-10-27 inventory audit](test-audit-2026-10-27.md) records the complete
focused selection, preserved case identities and explicit backend acceptance.
i18n separates `tests/node/` from `tests/browser/` to preserve independent React
renderer environments, with provider components under `tests/browser/component/`.
The shared Bun/jsdom preload lives in `packages/tooling/tests/setup/`.
Web's pure unit project does not initialize jsdom or DOM setup. Web and i18n use
the shared `workspaceTestProjects` helper to keep project defaults consistent.

API tests use `apps/api/tests/unit/` and `tests/integration/` for the default gate.
`test:unit` and `test:integration` select these directories. Database suites live
under `tests/postgres/node/` and `tests/postgres/cloudflare/`, selected only by
the `postgres` and `cloudflare-postgres` modes in one `vitest.config.ts`.
The existing script names select the mode; the default test command never connects to a database.
Worker suites share `tests/helpers/worker.ts` for process launch, readiness, redacted
diagnostics and shutdown. Database seeding and behavior assertions stay in each suite.

## Explicit gates

- TEST_DATABASE_URL pointing to an isolated *_test database, NODE_ENV=test:
  bun run test postgres validates full verification/login/reset/session revocation.
  CI uses PostgreSQL 17; an older local server is reported separately.
- The same isolated database with `bun run test postgres:cloudflare` validates the
  built Worker against direct PostgreSQL and local Hyperdrive bindings, including
  password hashing, concurrent account reads and session revocation. See
  [deployment verification](cloudflare.md#verification-and-limits) for fixture scope.
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
CI defaults to two workers. Local hosts with at least eight available CPUs and
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
and the pinned Node executable. Desktop browser acceptance builds `artifacts/browser` in
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
compiled SSR server under the pinned Node executable.

### Live AI and Beta-to-Desktop acceptance

These opt-in checks invoke the configured real Claude Code and Codex CLIs and consume
provider usage. Default verification uses subprocess fixtures and never invokes them.

Build the CLI, then run `RAYPX_LIVE_AGENTS=1 bun run --cwd apps/desktop native:agents`.
The gate creates temporary projects and uses Desktop's actual LocalEngine transport
with the standalone executable. It verifies file reads, plan rejection and approval,
generated Node tests, provider session resume across an engine restart, and cancellation
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
The isolated headed browser signs in, creates both providers' tasks, checks no
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
