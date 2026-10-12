# @raypx/e2e

## Purpose

Browser smoke tests for Web and Desktop. A
private workspace that is deliberately separate from Vitest.

## Interface

```text
browser-config.ts     shared Web/Desktop projects and required API/app servers
test-groups.ts        exhaustive smoke/projects/workbench/cloud spec catalog
playwright.config.ts   full browser run
playwright.web.config.ts Web suite, including cloud flows
playwright.desktop.config.ts Desktop-only suite
tests/web.spec.ts      Web home, language switching, and project-access smoke tests
tests/authenticated-web.spec.ts real login, SSR isolation and project flows
capture-product.ts    real-route product screenshots with guarded synthetic seed
tests/redesign.spec.ts Web responsive, theme, locale and navigation coverage
tests/desktop-redesign.spec.ts Desktop layouts, real writes and retry coverage
tests/workbench.spec.ts portal focus, failure/retry and cancellation
tests/homepage.spec.ts public cloud website, docs/SEO, locales and responsive containment
tests/cloud.spec.ts   real authorized cloud facts, review, usage and account isolation
tests/session-revocation-cloud.spec.ts real Better Auth sign-out terminates both private SSE streams
database.ts           isolated migration/seed with synthetic credential accounts
tests/desktop.spec.ts  Desktop theme, locale, navigation, settings and keyboard checks
```

Scripts: `e2e` (full run), `e2e:web`, `e2e:desktop`, `test:ui`, `test:report`, `check`.

## Ownership

- Own Playwright projects and startup for API, Web and the Desktop browser preview.
- `capture:product` requires the same guarded test database and already-running
  loopback API/Web servers (ports selected by RAYPX_E2E_PORT). It upserts only
  dedicated visual-example records and writes Web public product WebP images and their measured size manifest.
- Own no unit or integration coverage. Those live beside the code they test.

## Constraints

- **This workspace has no `test` script on purpose.** `vp run -r test` therefore
  skips it, which is what keeps E2E out of the default test command — it starts
  application servers and needs browser binaries. Do not add a `test` script.
- Run all browsers with `bun run test:e2e`, or select the independent
  `bun run test:e2e:web` / `bun run test:e2e:desktop` entry. These use `rpx e2e`
  to forward files, `--grep`, `--workers` and `--shard` through Turbo. Select a
  functional group with `--group smoke|projects|workbench|cloud`; omit it for all.
  `--list` needs no database and skips builds, servers and setup. Install browsers with
  `bun run --cwd e2e playwright install chromium`.
- Import from `@playwright/test`, **not** `vite-plus/test`. This is the one
  test-bearing workspace where that is correct.
- Spec files live in `tests/` and are named `*.spec.ts`. Register every spec
  exactly once in `test-groups.ts`; missing, stale or duplicate entries fail.
  A group with no tests for the selected application fails instead of passing empty.
- The full run starts API, Web and Desktop. Web-only starts API/Web; Desktop-only
  starts API/Desktop. Web includes Search/Computer, deliveries, acceptance,
  notifications, usage and real session isolation; there is no separate Cloud project.
- `webServer` starts Web at `RAYPX_E2E_PORT` (default 3000), Desktop at +1,
  and API at +2 with `NODE_ENV=test`. Group reports use separate suite directories.
- Executing tests requires NODE_ENV=test and TEST_DATABASE_URL naming raypx_*test.
  Global setup migrates and resets that dedicated database. Desktop seeds only
  accounts/projects; Web and full runs also seed cloud facts. Real API login uses
  seeded password hashes; do not introduce actor headers or production bypasses.
- CI runs Web in two shards and Desktop in one, on separate runners with their own
  PostgreSQL 17 database, ports and reports. Locally run sequentially in one checkout, or use separate checkouts,
  test databases and port ranges for parallel runs; shared build output is not isolated
  by distinct databases alone.
- `reuseExistingServer` is off in CI and on locally. Do not invert that.
- Cloud fixture records are explicitly synthetic persisted facts, created only by
  the guarded test setup. Production UI uses the real API and never supplies demo
  data or reports a model execution that did not happen.
- The reset migrates the fresh cloud schema; it never targets an operator database.
- Assert through roles and accessible names rather than CSS selectors, so the
  tests keep verifying accessibility alongside behaviour.

## Verification

```bash
bun run --cwd e2e check
bun run test:e2e:web --group cloud --list
bun run --cwd e2e playwright install chromium   # first run only
NODE_ENV=test TEST_DATABASE_URL=postgres://localhost/raypx_e2e_test bun run test:e2e:web
NODE_ENV=test TEST_DATABASE_URL=postgres://localhost/raypx_e2e_test bun run test:e2e:desktop
# Use bun run test:e2e when both suites are required.
```
