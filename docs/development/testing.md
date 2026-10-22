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

Never replace production cookie security with trusting null origins or disabling
web security. Do not count browser-preview tests as packaged-platform passes.
Unavailable platform checks remain open release gates, with their reasons reported.

## DOM matchers with the hoisted install

Register @testing-library/jest-dom/matchers using expect.extend on the expect
exported by vite-plus/test. Keep the jest-dom/vitest import type-only for assertion
augmentation; its runtime side effect can extend a different auto-installed Vitest
peer. Independent runner setup files preserve the shared Bun/jsdom preload.
