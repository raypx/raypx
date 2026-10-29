# Test case ownership and consolidation

> Historical validation snapshot: the Worker deployment target and its gates have been removed.
> Current deployment and verification use Node; commands below record the earlier state.

Keep each layer responsible for the behavior it can establish. Combining cases
should remove repeated preparation within one coherent journey. It must not
replace independent failures, account boundaries or platform behavior with a
single happy path.

| Layer                   | Owns                                                              | Keep independently identifiable                                        |
| ----------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Core/model unit tests   | Parsing, budgets, projections and pure state rules                | Boundary values, malformed data and unsupported protocol shapes        |
| Component tests         | Accessible controls and state transitions with injected ports     | Disabled actions, late responses, account changes and failure recovery |
| API integration         | HTTP/RPC contracts, safe logs and request correlation             | Authentication, Origin errors and unexpected failures                  |
| PostgreSQL gates        | Real persistence and transactional behavior                       | Ownership, CAS, idempotency, locks and retention                       |
| CLI subprocess fixtures | Provider protocols and durable execution                          | Interrupt races, stale callbacks, resume and cancellation              |
| Browser acceptance      | Compiled Web/Desktop user journeys and actual browser interaction | Host differences, browser layout, focus and privacy boundaries         |
| Native/live gates       | Packaged IPC, persistence and real remote execution               | Platform-specific and external-environment acceptance                  |

Similar assertions at different layers are not automatically duplicate coverage.
A pure diff parser test does not establish that an approval renders correctly;
an HTTP fixture does not establish real authentication or database isolation.

## Ordinary browser inventory

There are 28 ordinary cases and two opt-in environment cases. Web and Desktop
each retain 14 ordinary cases. Real interactions and the seven-case smoke selection
are unchanged. CI defaults to three workers; local defaults adapt to host capacity
as described in the [testing guide](testing.md#faster-browser-feedback).

| Suite                                                           | Ordinary cases | Responsibility                                                                |
| --------------------------------------------------------------- | -------------: | ----------------------------------------------------------------------------- |
| [access](../../e2e/tests/access.spec.ts)                        |              5 | Guest pages, private-page login returns, draft continuation, session recovery |
| [auth](../../e2e/tests/auth.spec.ts)                            |              2 | Registration and sign-in/recovery forms                                       |
| [settings](../../e2e/tests/settings.spec.ts)                    |              3 | Appearance/locale persistence, narrow layout and Desktop preview capability   |
| [navigation](../../e2e/tests/navigation.spec.ts)                |              4 | Sidebar state, keyboard/focus, localized account menu and sign-out recovery   |
| [analytics](../../e2e/tests/analytics.spec.ts)                  |              2 | Real SDK consent and safe outbound payloads on both hosts                     |
| [task conversation](../../e2e/tests/tasks/conversation.spec.ts) |              2 | Conversation, approval, queue/steer and responsive task workspace             |
| [task history](../../e2e/tests/tasks/history.spec.ts)           |              4 | Local/remote scope, short-page pagination and virtualized keyboard navigation |
| [task drafts](../../e2e/tests/tasks/drafts.spec.ts)             |              2 | Page filters, device draft restoration and responsive selection/focus         |
| [memory](../../e2e/tests/memory.spec.ts)                        |              2 | Reference versions, captured task context, budget and archived deletion       |
| [cloud jobs](../../e2e/tests/cloud-jobs.spec.ts)                |              2 | Saved schedules and task navigation outside the loaded page                   |

[Control](../../e2e/tests/control.spec.ts) and
[live agents](../../e2e/tests/live-agents.spec.ts) retain their explicit environment
requirements. Missing prerequisites mean skipped, never passed.

## Consolidation record, 2026-10-26

The previous `foundation.spec.ts` mixed 26 ordinary cases across unrelated domains
in 1419 lines. Its cases now live in the focused suites above.

| Previous coverage                                              | Current owner                                | Preserved checks                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Memory guest guards on both hosts, two cases                   | Each host's existing guest access journey    | No private reads, visible login action and exact `returnTo`                                                            |
| Cloud schedule guest guards on both hosts, two cases           | Each host's existing guest access journey    | No private reads, exact `returnTo`, Desktop cloud/local tab behavior                                                   |
| Account keyboard/localization plus avatar/sign-out, four cases | One account-menu journey per host, two cases | Enter/Escape, focus restoration, popup bounds, Chinese/dark controls, avatar, safe error and successful second attempt |

Guest request monitoring now includes memory and jobs alongside tasks, devices,
approvals, observed sessions, account and relay calls. Named steps identify which
private page failed. The account-menu steps share one user and page setup, with
locale/theme restored before testing the failed sign-out and retry.

Short-page pagination and virtualized pagination remain separate: they reproduce
different failures. Session-check failure, guest draft restoration and sign-out
failure also retain separate state/preconditions. No database, race or malformed
input cases were removed.

[Browser fixtures](../../e2e/tests/helpers/browser-fixture.ts) install the former
foundation response defaults for every ordinary suite. Each case still gets a
fresh Playwright context; authenticated context is never shared between cases.
Specific endpoint fixtures override defaults within that case. The shared account
fixture is named `signedInAccount` because it serves both hosts; it simulates
browser responses and never establishes real server authentication or Native IPC.

## Focused feedback and timing evidence

When a feature's access boundary changes, run access coverage with its main flow:

```sh
bun run test e2e --web -- 'access|memory'
bun run test e2e --desktop -- 'access|cloud-jobs'
bun run test e2e -- 'tasks/history|tasks/drafts'
```

Record the same worker count and capture mode before comparing timings. An
optional Playwright JSON report exposes case durations and start times:

```sh
PLAYWRIGHT_JSON_OUTPUT_FILE=/absolute/path/cases.json bun run test e2e -- --reporter=list,json
```

The initial local before/after sample passed 34/28 ordinary cases respectively,
with the same two environment cases skipped. Case count fell by six, but execution
from the first case start to the last result was 22.5/22.9 seconds; summed case
durations were 43.3/44.3 seconds. The first-case preparation gap varied from
3.3 to 21.9 seconds, producing total Playwright times of 25.9/45.0 seconds.
This establishes consolidation and coverage continuity, not a speedup. Measure
server startup, discovery and worker preparation separately before attributing
total-time changes to case execution. Reports remain under ignored `.artifacts`.

## Cache and concurrency follow-up, 2026-10-27

Turbo includes CLI passthrough arguments in dependency task hashes, even when it
does not append those arguments to the dependency command. Previously, changing
`--workers`, filename filters or the reporter could rebuild both applications.
Browser arguments now travel through `RAYPX_E2E_ARGS` as JSON and are decoded only
by the uncached `browser:run` leaf. Grep still intersects the surface/smoke filter.
An actual Turbo dry-run regression compares dependency hashes across selections.

The initial same-host comparison passed all 28 cases with two existing environment
skips: two workers took 25.8 seconds in Playwright; four workers took 16.3 and 18.3
seconds in two consecutive runs. One four-worker run still took 50.3 seconds end
to end because its new flags caused builds; repeating identical flags took 18.9
seconds with 17 dependency tasks cached. This identified the cache invalidation
separately from browser execution cost.

Local defaults now use four workers only with at least eight available CPUs and
16 GiB total memory, otherwise one or two. CI retains its two-worker default.
Use `-- --workers=2` to reduce local load; explicit CLI choices take precedence.
These measurements establish a local improvement, not a guarantee for every host.
No cases, assertions, real animations or browser isolation were removed.

A later cached four-worker run took 34.7 seconds, but its execution window was
still 13.9 seconds: readiness logs located 19 seconds in Desktop's Vite preview
startup. Desktop acceptance now serves the same compiled client assets directly
from loopback. Deep-link fallback, asset MIME/HEAD metadata, unchanged HTML/CSP,
missing resources and path/symlink containment have dedicated tests. Web retains
its real Node SSR process, and packaged Native acceptance remains separate.

Static acceptance also exposed a browser-build defect: Start's nested prerender
preview did not forward `--mode e2e`, so HTML referenced the normal Desktop
build's assets. The renderer leaf now carries its browser-build scope through
the nested config load; HTML and assets come from the same output. Task-wrapper
tests check that scope, and full browser acceptance exercises the actual CSP and
resource graph. The viewport helper waits for the responsive sidebar state before
recording geometry after a resize; real responsive behavior remains enabled.

After these fixes, two consecutive full runs passed all 28 ordinary cases with no
retries; the two external gates remained skipped. Playwright took 15.7 and 13.8
seconds, with first-case preparation at 1.1 and 0.8 seconds. The warmed run changed
the worker flag and retained all 17 dependency cache hits, completing the root
Turbo graph in 14.4 seconds. Compared with this host's two-worker 25.8/26.6-second
samples, full Playwright time fell by roughly 39–48%. These are local samples,
not a CI or cross-platform performance guarantee.

## VP task migration, 2026-10-27

The earlier Turbo timings above describe the previous runner. The VP migration
keeps the 28-case browser inventory, independent Vitest runners and existing test
isolation. Root task entry points remain compatible; current commands and cache
locations are in the [testing guide](testing.md).

A separate two-slot workspace-test benchmark on `fddc2ad` passed the same 1083 tests.
With empty task caches and warmed transform caches, Turbo took 107.6 seconds and
adapted VP took 104.9 seconds; that single paired sample does not establish a stable
full-execution improvement. Three all-hit samples had medians of 0.61/7.35 seconds.
Changing one logger entry file took 58.0/14.0 seconds: VP invalidated logger and API
from actual reads, while the prior package/transit graph also reran CLI. Incremental
feedback is the reason for choosing VP; the runner change is not a general execution
speed multiplier. An unsuccessful lock-race repeat and incomplete calibration runs
were excluded, and the final compared full runs both passed.

Task-runner regression coverage now executes real VP tasks against isolated files:
upstream type changes invalidate consumers, dependency artifacts remain inputs,
build outputs restore from cache, scoped literal argv/public build variables change
only the relevant task, and an ignored SDK is prepared before check reuse is decided.
The plan tests preserve renderer-only/browser build boundaries. Task configs are
lightweight and do not import app plugins or require a prepared Native SDK.

Migration acceptance passed `bun run verify`: 1087 workspace tests, policy, locales,
format, lint, strict checks, Node/Workers builds and relocated artifact probes,
plus the standalone CLI smoke. Full E2E passed 28 cases in 17.3 seconds; the two
external backend/live-Agent gates remained skipped. macOS arm64 packaging produced
the stable DMG; packaged Native shell/restore smoke passed, including the renderer,
CLI version, tray, preferences, server isolation and daemon survival after GUI Quit.
Windows, real HTTPS, PostgreSQL/Redis and CI runners were not verified in this
migration run.

After initial output directories existed, a root test repeat took 16.96 seconds:
22 cacheable tasks hit, with no misses. Tooling's complete suite now always executes
its independent VP fixtures because enclosing filesystem tracers cannot nest on
this macOS host; its unit-only entry remains cached. This is distinct from the earlier
all-hit benchmark. Creating output directories after clean also caused one-time
directory-listing invalidations despite file exclusions; the first post-build test
repeat took 87.12 seconds. These samples do not establish a CI speedup.

## Complete suite audit, 2026-10-27

The audit reconciled all 191 ordinary files and preserved every original case identity. Focused gates
now contain 569 unit, 287 component and 234 integration cases with no overlapping
files. It also covered real PostgreSQL/Redis, Workers and browser relay acceptance;
external inference and unavailable platforms remain separate gates.

## Ownership follow-up, 2026-10-27

Shared task-view cases now live in `packages/tasks/tests/component/`, grouped by
composer, conversation, observed requests and workspace. Web keeps auth, routes and
guest handoff tests; Desktop keeps its local IPC adapter, drafts and account/device
ownership tests. Pure Tasks rules live in `tests/unit/`. This lets a Tasks change
run its own UI regressions without requiring an application test command.

Host's renewal, replay and snapshot suites now live in `packages/host/tests/integration/`.
They exercise real loopback WebSockets and temporary storage, including real renewal
deadlines; CLI keeps the daemon-specific boundary tests. The shared helper registers
cleanup per case rather than reusing connections between cases.

Pi's injected SDK suite separates lifecycle, tool durability and authoritative
completion. Desktop's workspace suite separates conversation, history and drafts,
with the same reset/cleanup per case. Worker PostgreSQL auth, cleanup and schedule
suites share process startup and shutdown, while retaining independent data and
assertions for direct PostgreSQL and Hyperdrive.

No cases were combined or removed in this follow-up.
