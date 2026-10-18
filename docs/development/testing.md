# Verification

Run narrow meaningful workspace tests, then bun run verify. The default gate checks
catalog parity, workspace/platform rules, format, lint, types, unit/component tests,
builds, relocated Node API and Web SSR outputs and the compiled CLI. It requires no database,
GUI or mail provider. Node 24.15.0 must be selected (or use
RAYPX_NODE_BINARY). Test runners share test.config.ts and remain plugin-independent.

## Explicit gates

- TEST_DATABASE_URL pointing to an isolated *_test database, NODE_ENV=test:
  bun run test:postgres validates full verification/login/reset/session revocation.
  CI uses PostgreSQL 17; an older local server is reported separately.
- bun run test:e2e runs real Chromium Web/Desktop-renderer acceptance. Install
  Chromium first. Browser preview cannot validate native process access or cookies.
- bun run desktop:build on macOS and Windows checks the actual native package.
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
