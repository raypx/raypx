# @raypx/e2e

## Purpose

Browser acceptance of the compiled Web and Desktop renderer. Native bridges and
production-origin cookie persistence require separate packaged platform checks.

## Interface

Run `bun e2e` from the root for the complete compiled-artifact gate. Install the headless
browser with `bun --bun playwright install --only-shell chromium` in this workspace.
Use `bun e2e --web` or `bun e2e --desktop` to select one application.
Package scripts and Playwright `--project=web|desktop` select the same scope.
Pass filenames and Playwright flags directly. Use `--` for arguments that would
otherwise be interpreted as repository options. `--list` collects cases without
building applications or starting servers. `--dry-run` lists the application builds Turbo would run.

Each application owns `apps/<app>/e2e/*.spec.ts` .
Web owns auth, administration, account settings and Conversation backend acceptance;
Desktop owns renderer sign-in and device settings. Both start signed-in work at `/agents`. Shared journeys live in `tests/journeys/`; application
files call their `registerTests` through `@raypx/e2e/journeys/*`. Write each shared
flow once; project fixtures inject the surface and base URL. Shared response,
layout and interaction helpers stay in `tests/helpers/`, with application consumers
using `@raypx/e2e/testing`. Never import private helper paths across workspaces.

Turbo builds only selected applications: Web `build:e2e` produces the real Nitro Bun
artifact; Desktop `build:renderer` produces `artifacts/browser/client` without Go
or CLI preparation. Normal Web builds and daily verification retain type checks;
E2E does not repeat them. Both browser build tasks are cached, and tests always run.
Application CSS excludes `e2e/**` from Tailwind class scanning; fixture changes
must not alter styles or invalidate product builds. Compiled-style acceptance
checks a test-only utility never enters the generated CSS.
`raypx-dev e2e` runs those builds through Turbo and then starts one Playwright
process itself. Test filenames, grep, worker/report/trace flags reach only that
process, so they never enter a build's cache key.

`serve-web.ts` runs the compiled SSR server with `process.execPath`; `serve-desktop.ts`
serves the compiled client with deep-link fallback and original HTML/CSP. Playwright
owns and stops both loopback servers; occupied ports fail instead of reusing stale
artifacts. Reports live in ignored `test-results/<all|web|desktop>/` directories.
`browser-settings.ts` owns filter composition and Playwright defaults.
CI defaults to two workers; local 12+ CPU/32+ GiB hosts use eight, 8+ CPU/16+ GiB
hosts four, and smaller hosts one or two. Explicit `--workers` overrides this.

Surface, smoke and user grep filters intersect. Full `bun e2e` retains every
ordinary case; focused runs do not replace release acceptance. Each case gets a
fresh browser context and response fixtures. `signedInAccount` supplies its
member `account.access` projection; custom signed-in cases use `accountAccessFixture`.
The automatic public fixture defaults to guest access. Named steps identify checks
within a combined journey. See docs/development/testing.md for the coverage map.
Shared navigation journeys cover Agents, account menus, local preferences, English/Chinese
and 375px/1280px layouts. Memory journeys cover the retained standalone reference library.

## Constraints

No default test script. Do not import application source or seed operator databases.
Use accessible roles and real UI state. Native IPC and OS behavior are covered by the separate packaged gates.
HTTP fixtures isolate signed-out and form response rendering; they do not establish
server authentication correctness. The API PostgreSQL gate exercises real signup,
verification, password reset and session revocation. Manual screenshots require
`--visual`; failure screenshots remain enabled. Local traces are off by default;
CI records the first retry. Use `--trace on` for explicit local diagnosis.
Visual artifacts are written under ignored test-results for inspection.
Guests keep the public landing/legal/authentication pages and device preferences.
Private Agents routes preserve an allowlisted login destination and issue no private
reads before authentication. Guest task drafts and project/session browser flows are removed.

## Verification

`e2e:devtools` is a separate development-only browser gate with its own Playwright
configuration and two owned loopback Vite servers. Its suite is excluded from the
default compiled-artifact configuration. Client authorization is disabled only on
these isolated test servers; API traffic uses synthetic responses. It validates
both renderer surfaces without claiming native WebView acceptance.

Run `bun run --cwd e2e check`. `bun e2e` is the explicit browser gate.

The owned backend fixture also supplies the deterministic Conversation model and a test-only completion
gate for Web's `agents.spec.ts`; that case verifies streaming before commit and history
after reload. It is skipped without the owned backend fixture.
The owned backend fixture is opt-in; ordinary browser response fixtures do not prove
real backend, PostgreSQL, provider or native WebView behavior. Keep the fixture API
origin explicit in client builds. Desktop browser output allows only its validated
loopback API origin; static serving preserves its HTML/CSP.
