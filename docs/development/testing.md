# Testing and verification

Bun owns source tests. Vitest cases are `*.test.*`; browser acceptance uses
`*.spec.*` under application `e2e/`. Workspaces own their actual suites and root
commands discover them from manifests. Tests assert behavior and authorization,
not implementation shape. Shared fixtures stay test-only.

## Daily and full validation

Run `bun install`, `bun run i18n:types`, `bun format --write`, then
`CGO_ENABLED=0 bun run verify`. It selects affected source checks/tests and native
host inputs. `CGO_ENABLED=0 bun run verify --full` adds repository audits, builds
and current-platform artifact probes. It does not substitute for PostgreSQL,
compiled browser, real computer or packaged native acceptance. Never describe an
unrun platform as passed. See [validation automation](validation-artifacts.md).

## Databases and owned backend

Discover `test:postgres` scripts from workspace manifests and execute them
serially against an explicitly selected disposable database:

```sh
TEST_DATABASE_URL=<disposable-test-url> NODE_ENV=test bun run --cwd packages/agents test:postgres
bun run --cwd apps/api test
bun run test backends --with-e2e --database-url <disposable-test-url> -- --workers=1
```

The backend command uses the exact supplied database without creating or dropping
another. It owns a temporary Redis process, executes API PostgreSQL and Redis
suites and optionally starts the test-only workspace browser fixture. Without an
explicit database URL it provisions its own isolated PostgreSQL; never use that
mode when the session restricts the database. Redis tests exercise current split
connector routing and shared caches. Durable Runs use PostgreSQL independently.
PostgreSQL suites reset their disposable schema/data. Never supply an operator
or retired database. No data-import fixture exists.

`apps/api/tests/postgres/node/device-daemon.test.ts` runs the real built daemon
with a private temporary home and native-confirmation test hook. Set
`RAYPX_DEVICE_TEST_CLI` to the absolute prepared executable. It verifies pairing,
Space grants, fenced command execution and revocation. This establishes no GUI
or packaged operating-system acceptance.

## Browsers

`bun e2e --workers=2` builds selected Web/Desktop artifacts and runs Playwright.
It owns loopback servers and fails on occupied ports. Ordinary response fixtures
exercise rendering; owned-backend journeys are skipped without the explicit
fixture. `test backends --with-e2e` exercises those journeys against actual
PostgreSQL. The fixture model and computer are deterministic; they establish no
live model or Engine result. Devices use a non-executing connector fixture;
protected-input traces/screenshots stay disabled around generated values.

The shared journeys cover public/authentication flows, workspace navigation,
conversations and streaming, active Runs, approvals, Auto review, Space routines,
memory, Pages, skills, HTTP tools, member management, delegation and computers.
Browser tests do not prove native WebView, OS dialogs, cookie storage or Mobile.
`bun run e2e:devtools` is a separate isolated development-only gate.

## Mobile

Run Mobile `check`, `test` and `build` scripts. Build exports the supported client
bundle; it does not establish iOS/Android device behavior. Native acceptance is
separate, including sign-in, invitations, drafts, reconnect and computer lifecycle.
Mobile has no native Screen UI and uses Web handoff for complete resource editing.

## Native and providers

Prepare exactly one production CLI with `bun run build:cli`. Consumers select the
immutable payload with `RAYPX_CLI_PAYLOAD`. `bun run --cwd apps/cli smoke` tests the
installed payload in a private temporary home. Go `mygo:check`/`mygo:test` cover the
host; `RAYPX_MYGO_CLI=<absolute-executable>` enables compiled-channel checks.
Native package/signature/interactive WebView gates remain separate per platform.
Never inspect or modify a real user's Raypx home, enrollment or credentials.
Only stop owned processes. Tests retain logs and evidence under `.artifacts/`.

Supervisor acceptance uses an explicitly authorized Engine socket and private
network. Live model checks require explicit request-owned credentials. Neither
belongs to the default source gate. No local Agent harness, terminal-helper
acceptance, cloud-device scheduler or Relay protocol cluster suite remains.

Artifact probes use the explicit disposable TEST_DATABASE_URL when supplied to
exercise relocated API routes and readiness. Without it, the API probe requires
the sanitized startup refusal caused by unavailable PostgreSQL; it does not claim
healthy API acceptance. Relay probes retain an unavailable broker check.
