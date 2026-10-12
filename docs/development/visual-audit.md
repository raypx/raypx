# Unified workbench visual audit

This is the historical blue/violet redesign record. The current visual baseline
and verification results are in [Neutral UI delivery](./neutral-ui.md).

The September 28, 2026 redesign covers the website, authentication, Web projects,
Admin and Desktop. It follows [DESIGN.md](../../DESIGN.md) and
[the design architecture](../architecture/design.md). Agent execution, upload
protocols and new backend capabilities are outside this delivery.

## Implemented behavior

- Shared blue/violet tokens, 14px body and at least 12px secondary text, 8px
  controls, 12px panels, keyboard focus and reduced-motion support. Web controls
  use 40px, Desktop 36px, and coarse-pointer targets at least 44px.
- Project and Admin routes share Web navigation and account preferences. The
  rail becomes icons below 1024px and a focus-managed drawer below 768px.
- Projects use scan-friendly rows and a creation dialog. Details combine tasks,
  explicit access and a 288px information column which reflows on narrow screens.
- Admin uses the filtered API total, a compact table/mobile list and sticky
  current-page batch controls. Unknown last activity stays unknown.
- Marketing uses captures of actual project routes with synthetic example data.
  The primary action opens `/projects`; authentication retains capability gates.
- Desktop supports a collapsible rail and an 800px native/renderer minimum.
  Overview and devices never substitute fixtures for unavailable responses;
  Activity explicitly reports its unavailable capability. Unwired preferences
  are disabled with an explanation, without discarding stored choices.
- Request failure, absent configuration, expired sessions, denied access and
  missing projects have distinct presentation. Refresh retries loaders in place.
  Web hydration preserves public API error codes without serializing backend
  messages, causes, request data or stacks.

## Compatibility and boundaries

HTTP/RPC paths, native Date values, schema, migration history and authorization
remain unchanged. Admin selection still belongs to the page/account store;
filters and cursors remain in URLs; remote entities remain in loaders. Desktop
preference migration, delayed hydration, tray behavior and directory permission
boundaries are preserved. No dependencies or native permissions were added.

Start regenerates the Web route tree with the `startInstance` serialization
registration. The route paths and hierarchy are unchanged. Desktop route
generation and all database artifacts have no intended diff.

## Visual evidence

Before captures were taken from canary `e1406b9`, with synthetic E2E accounts.
They show the old project cards, oversized Admin metrics and old Desktop overview.
After captures use the same real local API and PostgreSQL 17 test database.
Screenshot comparisons illustrate composition, not pixel-diff equality: viewport,
locale and sample records are documented alongside each image.

| Page           | Before / after                                |
| -------------- | --------------------------------------------- |
| Projects       | [Comparison](./visual-evidence/projects.webp) |
| Admin          | [Comparison](./visual-evidence/admin.webp)    |
| Authentication | [Comparison](./visual-evidence/login.webp)    |
| Desktop        | [Comparison](./visual-evidence/desktop.webp)  |

`e2e/tests/redesign.spec.ts` captures the following matrix into Playwright's
`e2e/test-results` directory. Screenshot capture preserves the caret to avoid
mutating inputs before React hydration.

| Surface          | Viewports and combinations                                   | Pages                                                                 |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Web              | 375 zh dark; 768 en light; 1280 zh light; 1440 en dark       | Website, login, signup, reset, verification, projects, details, Admin |
| Desktop renderer | 800 zh dark; 1120 en light; 1440 zh light                    | Overview, projects, details, activity, settings, devices              |
| Edge cases       | 800px long unbroken project title and long task; API offline | Real creation/persistence, overflow, no fixture fallback, retry       |

The local delivery gallery includes original before/after captures and responsive
screenshots. It is an accompanying artifact, not application runtime content.
The four committed marketing PNGs are reproducible using:

```bash
NODE_ENV=test TEST_DATABASE_URL=postgres://localhost/voidmix_e2e_test \
  VOIDMIX_E2E_PORT=3000 bun run --cwd e2e capture:product
```

Run API and Web on the configured loopback ports first. This command only upserts
its dedicated synthetic example records; it never uses a developer account.

## Verification record

Focused baselines before changes: UI 20, Web 96, Desktop 82 passing tests.
Final focused counts: UI 23, Web 98, Desktop 85 passing tests. `bun run verify
--verbose` passes all 644 tests, i18n, policy, formatting, lint, workspace
typechecks/builds, Storybook build and Web/API Nitro runtime probes. Existing
non-blocking lint warnings and jsdom scrollTo notices remain.

`bun run test:e2e` passes 23 Chromium tests against the real local API and
PostgreSQL 17. Run it after `verify`: rebuilding shared package outputs while
the dev servers serve E2E traffic can cause temporary 500 responses.

`bun run desktop:build` produces the macOS app and arm64 DMG. Native checks
exercise launch, unavailable configuration, navigation collapse and hiding the
window while its process remains alive. The 800px layout is checked in Chromium;
native minimum width is configured to 800px. Native drag-resize automation reports
`noWindowsAvailable`, so a manual resize-to-minimum check remains unverified.
No Rust source or native capability changed. Other OS native builds were not run.

E2E covers real sign-in, project/task writes and reload, pagination/history,
SSR session isolation, account replacement, Admin server filters and writes,
error recovery, no-data authenticity, localized layouts, theme persistence,
keyboard navigation and dialog/drawer focus restoration. Component tests retain
partial batch success and late-response/account lifecycle coverage.
