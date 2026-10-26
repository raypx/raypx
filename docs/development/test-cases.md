# Test case ownership and consolidation

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
each retain 14 ordinary cases. The two-worker default, real interactions and
seven-case smoke selection are unchanged.

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
bun run test:e2e:web -- 'access|memory'
bun run test:e2e:desktop -- 'access|cloud-jobs'
bun run test:e2e -- 'tasks/history|tasks/drafts'
```

Record the same worker count and capture mode before comparing timings. An
optional Playwright JSON report exposes case durations and start times:

```sh
PLAYWRIGHT_JSON_OUTPUT_FILE=/absolute/path/cases.json bun run test:e2e -- --reporter=list,json
```

The initial local before/after sample passed 34/28 ordinary cases respectively,
with the same two environment cases skipped. Case count fell by six, but execution
from the first case start to the last result was 22.5/22.9 seconds; summed case
durations were 43.3/44.3 seconds. The first-case preparation gap varied from
3.3 to 21.9 seconds, producing total Playwright times of 25.9/45.0 seconds.
This establishes consolidation and coverage continuity, not a speedup. Measure
server startup, discovery and worker preparation separately before attributing
total-time changes to case execution. Reports remain under ignored `.artifacts`.
