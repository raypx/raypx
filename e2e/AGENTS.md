# @voidmix/e2e

## Purpose

Browser smoke tests for Web, protected Admin routes, and Desktop. A
private workspace that is deliberately separate from Vitest.

## Interface

```text
playwright.config.ts   projects, baseURLs, and the webServer definitions
tests/web.spec.ts      Web home, language switching, and project-access smoke tests
tests/admin.spec.ts    Admin smoke project
tests/authenticated-web.spec.ts real login, SSR isolation, project and Admin flows
capture-product.ts    real-route product screenshots with guarded synthetic seed
tests/redesign.spec.ts responsive, theme, locale and navigation coverage
tests/workbench.spec.ts portal focus, failure/retry and cancellation
tests/homepage.spec.ts public cloud website, docs/SEO, locales and responsive containment
tests/cloud.spec.ts   real authorized cloud facts, review, usage and account isolation
tests/session-revocation-cloud.spec.ts real Better Auth sign-out terminates both private SSE streams
database.ts           isolated migration/seed with synthetic credential accounts
tests/desktop.spec.ts  Desktop theme, locale, navigation, settings and keyboard checks
```

Scripts: `e2e` (the run), `test:ui`, `test:report`, `check`.

## Ownership

- Own Playwright projects and startup for API, Web and the Desktop browser preview.
- `capture:product` requires the same guarded test database and already-running
  loopback API/Web servers (ports selected by VOIDMIX_E2E_PORT). It upserts only
  dedicated visual-example records and writes Web public product WebP images and their measured size manifest.
- Own no unit or integration coverage. Those live beside the code they test.

## Constraints

- **This workspace has no `test` script on purpose.** `vp run -r test` therefore
  skips it, which is what keeps E2E out of the default test command — it starts
  application servers and needs browser binaries. Do not add a `test` script.
- Run it explicitly with `bun run test:e2e`; install browsers with
  `bun run --cwd e2e playwright install chromium`.
- Import from `@playwright/test`, **not** `vite-plus/test`. This is the one
  test-bearing workspace where that is correct.
- Spec files live in `tests/` and are named `*.spec.ts`, matched per project by
  `testMatch`. A file that matches no project pattern runs in no project
  and reports nothing.
- `webServer` starts Web at `VOIDMIX_E2E_PORT` (default 3000), Desktop at +1,
  and API at +2 with `NODE_ENV=test`. Web/Admin share Web; Desktop has its own
  project. Admin verifies the unauthenticated redirect without actor headers.
- All runs require NODE_ENV=test and TEST_DATABASE_URL naming voidmix_*test.
  Global setup migrates and resets that dedicated database. Real API login uses
  seeded password hashes; do not introduce actor headers or production bypasses.
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
bun run --cwd e2e playwright install chromium   # first run only
NODE_ENV=test TEST_DATABASE_URL=postgres://localhost/voidmix_e2e_test bun run test:e2e
```
