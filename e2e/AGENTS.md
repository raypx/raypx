# @raypx/e2e

## Purpose

Browser acceptance of the compiled Web and Desktop renderer. Native bridges and
production-origin cookie persistence require separate packaged platform checks.

## Interface

Run bun run test e2e after installing Chromium with bun --bun playwright install chromium.
`tests/helpers/serve-web.ts` starts the compiled Web artifact with the running Bun
executable (`process.execPath`); Desktop directly
serves `artifacts/browser/client`, built with `build:renderer`, through the loopback
static helper. It preserves compiled HTML/CSP and assets without loading Vite config.
Root `test e2e --web`, `--desktop`, `--smoke` and `--visual` provide focused entry
points. Package-local `e2e` and `e2e:*` commands use the same build graph through
`raypx.taskScripts`; `_e2e` is VP's private runner. Pass Playwright flags after `--`.
Surface/smoke filters intersect with user grep. Full `test e2e`
retains all cases; focused runs do not replace full acceptance. CI defaults to two
workers; local 8+ CPU/16+ GiB hosts use four, smaller hosts one or two. Override
with `-- --workers=2` on a busy machine. Test argv is decoded only by `browser:run`
from `RAYPX_E2E_ARGS`, preserving dependency cache hashes across filters/reporters.

Ordinary cases live in access/auth/settings/navigation/analytics and feature suites;
task conversation/history/drafts use `tests/tasks/`. Access owns private memory/job
guards, while their feature suites own signed-in journeys. Run both for boundary
changes (for example `-- 'access|memory'`). Shared response fixtures are per case;
never reuse an authenticated context across cases. Named steps identify checks
within a combined journey. See docs/development/test-cases.md for the coverage map.

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
both surfaces against that fixture API. The default browser
suite skips this gate when the fixture is absent; it must not be reported as passed.
For an HTTP loopback fixture, set `VITE_API_URL` to that exact API origin when
building both surfaces. The dedicated Desktop browser output includes only that
validated loopback Origin in connect-src; static serving preserves its HTML/CSP.

`e2e:live` uses `playwright.live.config.ts` and the opt-in `live-agents.spec.ts`.
It uses a dedicated test account, a running packaged native beta acceptance instance,
real HTTPS/WebSocket traffic and real Claude/Codex inference. Never use a person's
account. Keep tracing off to avoid recording login request bodies; the default E2E
gate skips this live suite. All browser gates default to headless; use `--headed` only for explicit interactive diagnosis. Close the isolated browser after acceptance.
