# @raypx/e2e

## Purpose

Browser acceptance of the compiled Web and Desktop renderer. Native bridges and
production-origin cookie persistence require separate packaged platform checks.

## Interface

Run `bun run test e2e` for the complete compiled-artifact gate. Install the headless
browser with `bun --bun playwright install --only-shell chromium` in this workspace.
For daily work use `bun run --cwd apps/web e2e` or `apps/desktop e2e`; root
`test e2e --package web|desktop` and Playwright `--project=web|desktop` select the
same application. `--web`/`--desktop`, `--smoke` and `--visual` remain available.
Pass filenames and Playwright flags after `--`. `--list` collects cases without
building applications or starting servers. `--dry-run` shows the VP plan.

Each application owns `apps/<app>/e2e/*.spec.ts` (including task subdirectories).
Web owns auth, administration and account settings; Desktop owns local access,
settings and task pagination. Shared journeys live in `tests/journeys/`; application
files call their `registerTests` through `@raypx/e2e/journeys/*`. Write each shared
flow once; project fixtures inject the surface and base URL. Shared response,
layout and interaction helpers stay in `tests/helpers/`, with application consumers
using `@raypx/e2e/testing`. Never import private helper paths across workspaces.

VP builds only selected applications: Web `build:e2e` produces the real Nitro Bun
artifact; Desktop `build:renderer` produces `artifacts/browser/client` without Go
or CLI preparation. Normal Web builds and daily verification retain type checks;
E2E does not repeat them. Both browser build tasks are cached, and tests always run.
Application CSS excludes `e2e/**` from Tailwind class scanning; fixture changes
must not alter styles or invalidate product builds. Compiled-style acceptance
checks a test-only utility never enters the generated CSS.
Test filenames, grep, worker/report/trace flags travel only through `RAYPX_E2E_ARGS`
to the uncached `browser:run` leaf, preserving dependency fingerprints.

`serve-web.ts` runs the compiled SSR server with `process.execPath`; `serve-desktop.ts`
serves the compiled client with deep-link fallback and original HTML/CSP. Playwright
owns and stops both loopback servers; occupied ports fail instead of reusing stale
artifacts. Reports live in ignored `test-results/<all|web|desktop>/` directories.
CI defaults to two workers; local 12+ CPU/32+ GiB hosts use eight, 8+ CPU/16+ GiB
hosts four, and smaller hosts one or two. Explicit `--workers` overrides this.

Surface, smoke and user grep filters intersect. Full `test e2e` retains every
ordinary case; focused runs do not replace release acceptance. Each case gets a
fresh browser context and response fixtures. `signedInAccount` supplies its
member `account.access` projection; custom signed-in cases use `accountAccessFixture`.
The automatic public fixture defaults to guest access. Named steps identify checks
within a combined journey. See docs/development/testing.md for the coverage map.
Conversation fixtures load at most 200 messages across initial data, older pages
and gap fills. The reading-position regression uses fourfold Chromium CPU
throttling to expose delayed measurements and checks settled positions within 3px.

## Constraints

No default test script. Do not import application source or seed operator databases.
Use accessible roles and real UI state. Browser preview does not simulate native IPC.
HTTP fixtures isolate signed-out and form response rendering; they do not establish
server authentication correctness. The API PostgreSQL gate exercises real signup,
verification, password reset and session revocation. Manual screenshots require
`--visual`; failure screenshots remain enabled. Local traces are off by default;
CI records the first retry. Use `--trace on` for explicit local diagnosis.
Visual artifacts are written under ignored test-results for inspection.
Guest Web acceptance asserts no private list/subscription requests before login,
preserves the original page and draft choices through sign-in, and checks restoration
does not send a task. Desktop local pages stay available before login and during session
errors; remote views require confirmed login and preserve their return destination.

## Verification

`e2e:devtools` is a separate development-only browser gate with its own Playwright
configuration and two owned loopback Vite servers. Its suite is excluded from the
default compiled-artifact configuration. Client authorization is disabled only on
these isolated test servers; API traffic uses synthetic responses. It validates
both renderer surfaces without claiming native WebView acceptance.

Run bun run --cwd e2e check; bun run test e2e is an explicit browser gate.

The control browser test is an explicit real-backend gate. Launch the isolated API
with `RAYPX_VALIDATION=1` (never a client flag), set CONTROL_E2E_API_URL and build
both surfaces against that fixture API. The `control` project is registered only when that fixture is present; ordinary
project runs do not establish real-backend acceptance.
For an HTTP loopback fixture, set `VITE_API_URL` to that exact API origin when
building both surfaces. The dedicated Desktop browser output includes only that
validated loopback Origin in connect-src; static serving preserves its HTML/CSP.

`e2e:live` uses `playwright.live.config.ts` and the opt-in `live-agents.spec.ts`.
It uses a dedicated test account, a running packaged native beta acceptance instance,
real HTTPS/WebSocket traffic and real Claude/Codex inference. Never use a person's
account. Keep tracing off to avoid recording login request bodies; the default E2E
gate excludes this live suite. All browser gates default to headless; use `--headed` only for explicit interactive diagnosis. Close the isolated browser after acceptance.
