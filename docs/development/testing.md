# Verification

Run narrow meaningful workspace tests, then bun run verify. The default gate checks
catalog parity, workspace/platform rules, format, lint, types, unit/component tests,
builds, relocated Node API and Web SSR outputs, actual Cloudflare workerd outputs,
and the compiled CLI. It requires no database,
GUI or mail provider. Node 24.15.0 must be selected (or use
NODE_BINARY). Test runners share test.config.ts and remain plugin-independent.
Verification schedules lint, checks, tests and builds in one Turbo graph. Desktop's
SDK preparation runs once in that graph; generated SDK contents enter the desktop
check hash after preparation. SDK preparation remains an uncached Turbo task. Root
development dotenv files are not additionally loaded by verification. Turbo runs
in `loose` environment mode, so tasks inherit the parent environment without
`passThroughEnv` allowlists. `NODE_BINARY` still identifies the real pinned Node
before Bun changes PATH. Variables affecting cached outputs remain declared in
`env`/`globalEnv` so their values participate in cache keys.

## Daily feedback and machine load

Use `bun run verify:quick` during development. It checks locale catalogs, repository
policy, formatting, lint, types and workspace tests, without application builds or
artifact probes. Run `bun run verify` before release; CI retains the complete gate.

Turbo runs at most two workspace tasks concurrently and each Vitest runner uses
one worker. This avoids multiplying workspace and file concurrency, although a
build or test may still start its own subprocesses. Tests retain per-file isolation.
Use `bun run test --concurrency=1` on a busy machine. A single workspace can opt
into more workers with `bun run --cwd packages/ui test --maxWorkers=2`.

Start with the changed workspace, then include its consumers when needed:

```sh
bun run test --filter=@raypx/ui
bun run test '--filter=...@raypx/ui'
```

Root `test`, `verify:quick` and `verify` write task timings and cache results to
`.turbo/runs/` using `--summarize`. Cached tasks replay earlier logs; their printed
test duration is not the elapsed time of the current run. Use the summary to find
slow tasks and cache misses before changing timeouts. Keep `.turbo/cache` between
runs; cleaning it forces work to run again.

The root `dev` command reserves three task slots for its two persistent Web/API
servers; Turbo requires a spare slot beyond the number of persistent tasks.

## Test locations

Every workspace keeps test suites, test-only setup and fixtures under `tests/`.
Use directories for test kind: Web has `tests/unit/` and `tests/component/`,
UI has `tests/component/`, and Tooling has `tests/unit/` and `tests/integration/`.
Keep filenames focused on the subject (`auth.test.tsx`, `cache.test.ts`).
The `test:unit`, `test:component` and `test:integration` scripts select these directories.
Desktop separates `tests/renderer/`, `tests/native/` and `tests/scripts/` and checks
each against its platform types. Renderer suites use `unit/` and `component/`
subdirectories; scripts select directories independently of the `.ts`/`.tsx` extension.
Development and packaging scripts live under `apps/desktop/scripts/native/`.
The packaged smoke runner and scenario live in `tests/native/smoke/` outside the default suite.
CLI runtime suites are split by capability under `tests/runtime/`; standalone
artifact and PTY smoke gates live in `tests/smoke/`. CLI and Tooling shared fixtures
live in their own `tests/helpers/` and own temporary resource cleanup.
E2E server launch helpers live in `e2e/tests/helpers/`.
i18n separates `tests/node/` from `tests/browser/` to preserve independent React
renderer environments, with provider components under `tests/browser/component/`.
The shared Bun/jsdom preload lives in `packages/tooling/tests/setup/`.

API tests use `apps/api/tests/unit/` and `tests/integration/` for the default gate.
`test:unit` and `test:integration` select these directories. Database suites live
under `tests/postgres/node/` and `tests/postgres/cloudflare/`, selected only by
the `postgres` and `cloudflare-postgres` modes in one `vitest.config.ts`.
The existing script names select the mode; the default test command never connects to a database.

## Explicit gates

- TEST_DATABASE_URL pointing to an isolated *_test database, NODE_ENV=test:
  bun run test:postgres validates full verification/login/reset/session revocation.
  CI uses PostgreSQL 17; an older local server is reported separately.
- The same isolated database with `bun run test:postgres:cloudflare` validates the
  built Worker against direct PostgreSQL and local Hyperdrive bindings, including
  password hashing, concurrent account reads and session revocation. See
  [deployment verification](cloudflare.md#verification-and-limits) for fixture scope.
- `TEST_REDIS_URL` pointing to a disposable Redis or Valkey (`docker compose up -d valkey`
  serves `redis://localhost:6380`): `bun run test:redis` checks the session cache,
  fixed-window counters and concurrent RPC limits. Keys use a unique, expiring prefix.
- bun run test:e2e runs real Chromium Web/Desktop-renderer acceptance. Install
  Chromium first. Browser preview cannot validate native process access or cookies.
- bun run package:desktop on macOS and Windows checks the actual native package.
  Release acceptance additionally verifies views://main session persistence on macOS
  WebKit/Windows CEF against HTTPS auth, bundled CLI resolution/version, picker grants,
  tray scheduling, restart, EOF/quit cleanup and PTY resize/cancellation.

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
