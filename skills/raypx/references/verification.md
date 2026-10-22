# Verification

Canonical source: [testing](../../../docs/development/testing.md).

1. Run the narrow suite of each workspace you touched:
   `bun run --cwd <workspace> check` and `bun run --cwd <workspace> test`.
2. Run `bun run verify`: catalog parity, workspace/platform policy, format, lint,
   types, unit/component tests, builds, relocated Node Web/API outputs, Cloudflare
   workerd outputs and the compiled CLI. It needs no GUI, database or mail provider.
3. Run explicit gates only when the change needs them, and report any you could not
   run as unavailable, never as passed:
   - `bun run test:postgres` / `test:cloudflare:postgres` with `TEST_DATABASE_URL`
     pointing at an isolated `*_test` database and `NODE_ENV=test`.
   - `bun run test:redis` with `TEST_REDIS_URL` (compose `valkey` on 6380).
   - `bun run test:e2e` for Chromium acceptance of Web and the Desktop renderer.
   - `bun run desktop:build` on macOS/Windows for the native package.

Tests live in each workspace's `tests/` directory (`unit/`, `component/`,
`integration/`); shared runner defaults are in root `test.config.ts`, and application
Vite plugins never enter the test runner.
