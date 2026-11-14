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
and 375px/1280px layouts. Routines and Space memory journeys cover Cron creation, manual execution, document revisions and restore through the owned backend fixture.

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

Pages and Skills/Tools journeys use isolated Spaces in the owned backend fixture.
Pages checks immutable versions, public cookie-free sandboxing and revocation in a
fresh browser context; traces/screenshots are disabled for one-time link display.
Mocked Web shell journeys explicitly inject an unavailable SSR account read with
their dummy cookie, even when the owned API is reachable; it grants no session.
Desktop always asserts the Web handoff and absence of frames, including fullscreen
and historical preview, while still saving, restoring and sharing Page versions.
The Page journey follows a produced activity link live, then follows the retained
history link after deletion and checks the explicit deleted state.
The fixture MCP endpoint is non-executing JSON-RPC and the deterministic model calls
only its discovered tool, through the real approval pipeline.

Active-Run acceptance appends bounded fixture history after an old waiting Run,
reloads, answers from Still working and jumps to its trigger page. OpenAPI
acceptance imports the fixture document once, enables one read and one mutating
operation, answers the change approval and inspects committed activity/effects.
Both journeys use isolated Spaces and the same owned API in both renderers.
Opt-in light screenshots at 1440×860 and 375×812 live under `.artifacts/`.

`computer-screen` is a shared owned-backend journey using deterministic PNG
frames, two actual member sessions, exclusive/forced control, keyboard release
and stop. It writes explicit review screenshots under `.artifacts/screen/`; no
invitation or credentials appear in those captures. Ordinary runs skip it.
Expansion must reuse the viewer stream and grant. Verify the first Escape
releases control while the dialog remains open and the next Escape closes it
with focus restored to its opener. These renderer checks establish no native
Mobile Screen support or packaged WebView result.

Auto review acceptance uses the always-approve fixture reviewer through the real
approval service. A requested safe file write resolves automatically with its
reason after reload; a Page carrying injected approval instructions forces the
next write to the member. `auto-review.spec.ts` runs on both renderers and saves
opt-in mode/decision screenshots under `.artifacts/auto/`.

`device-computers.spec.ts` uses the owned backend's non-executing connector and
explicit native-confirmation hook. Both renderers pair from Devices settings,
grant a directory, select that computer, approve a command and revoke the device.
The command remains pending with the always-approve reviewer and reaches the
fake connector only after the member answers. Traces/video are disabled around
pairing codes; optional captures after clearing the code use `.artifacts/device/`.
This browser gate establishes no native dialog, real command or packaged result.

`protected-input.spec.ts` runs the shared masked-input journey on Web and Desktop
with the owned backend. It verifies ordinary approval, durable reload, supply/decline
and event/effect/storage leak checks. The pending form stays once above the composer
in all three tabs. Opt-in light/dark screenshots at 1440×860 and 375×812 are saved
under `.artifacts/ui/` before any value is generated or entered. Trace, video and
automatic screenshots stay disabled around generated sensitive values.

Protected-input journeys cover every destination, including both device channels and both masked basic fields. Test-only transcript inspection is session/Space scoped. All protected journeys disable traces, video and automatic screenshots around values.

attachments-notifications journeys exercise real owned-backend uploads, image
parts, download/reload, device Files/withholding and notification sources on both
renderers. RAYPX_E2E_SCREENSHOTS writes light/dark evidence to .artifacts/attach/.

Page review is opt-in with `RAYPX_PAGE_REVIEW_PHASE=before|after` and `--visual`.
The capture helper records all four review widths and both themes, restoring the
original reading positions afterwards. `page-review` covers safe settings/editor and
directory states. JSONL evidence under `.artifacts/pages/` supplies the before/after
index; native device screenshots remain separate. `playwright.review.config.ts`
reviews already-running owned compiled servers without starting or rebuilding them.

bootstrap.spec.ts uses the exclusive bootstrap-server.ts fixture on an empty disposable
loopback database, with fake mail transport and production auth/configuration composition.
It is opt-in via BOOTSTRAP_E2E_API_URL; run separately from the seeded workspace fixture.
Trace/video/screenshots stay off around credentials and one-time recovery links.

RAYPX_PAGE_REVIEW_DIRECTORY selects an evidence directory (default .artifacts/pages);
RAYPX_PAGE_REVIEW_MATCH filters named matrix checkpoints for focused visual review.
Public landing and auth review cover four widths and both languages; owned attachment
acceptance waits for a decoded nonempty image through the authorized download path.

RAYPX_PAGE_REVIEW_WIDTHS may select 1440, 1024, 768 or 390; the default remains all
four. admission-visual covers bootstrap, invitation-only, no-mail, Email setup/results,
optional reminders and reset confirmation in en/zh. Only empty masked fields and the
pre-issue reset confirmation are captured; issued recovery credentials never are.

Capture may reveal a supplied locator after each resize so lower-page result states
remain visible at narrow widths; original scroll positions are restored afterwards.
