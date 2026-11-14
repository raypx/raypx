# Testing and verification

Run meaningful focused suites, then `bun run verify`. Default verification needs
no PostgreSQL, Docker, GUI, credentials or emulator. It selects affected source
checks/tests; native inputs add current-platform Go checks. `verify --full` adds
repository audits, builds and artifact probes for release preparation. Neither
command replaces explicit database, browser, sandbox or packaged platform gates.

## Test commands

Use `bun run test`: `bun test` invokes Bun's different built-in runner. Workspace
manifests own actual suites; root commands discover them rather than maintaining
a package list. Only layers with real tests declare scripts.

```sh
bun run test --help
bun run test list
bun run test
bun run test unit
bun run test component
bun run test integration
bun run test coverage
bun run test --package @raypx/agents
bun run test component --package agents
bun run test unit --package packages/agents -- --testNamePattern checkpoint
bun run --cwd apps/mobile test
```

`--package` accepts a manifest name, path or unambiguous directory name. A direct
workspace script selects the same suites, while root commands also run graph
prerequisites. Turbo options precede `--`; Vitest filenames/flags follow it.
Use a package selector when forwarding test arguments. Do not combine `--package`
with Turbo filters. `--no-cache` on `verify` becomes Turbo `--force`.

## Ownership and assertions

| Layer          | Location and evidence                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Unit           | Source-adjacent `*.test.ts(x)`; pure rules, models, repositories with injected ports and adapters.                                    |
| DOM component  | `*.component.test.ts(x)` with happy-dom; accessible interaction, state, effects, focus and localization.                              |
| Integration    | Workspace `tests/`; runtime, filesystem/process, synthetic HTTP and transport scenarios. Default suites remain database-free.         |
| PostgreSQL     | Opt-in workspace `test:postgres` modes, separate from default discovery. Real constraints, transactions, fencing, scope and recovery. |
| Browser        | Application-owned `apps/web/e2e/` and `apps/desktop/e2e/`, shared journeys under root `e2e/tests/journeys/`.                          |
| Native Mobile  | Vitest native component tests use Mobile's React and native host mocks. Device behavior is a separate gate.                           |
| Native Desktop | Go policies/transport, prepared CLI/terminal payload, packaged WebView and installed distribution each have separate checks.          |

`*.spec.*` is reserved for Playwright below `e2e/`; Vitest uses `*.test.*`.
`test.config.ts` exports plain runner defaults. Each workspace uses native
`defineConfig`/`mergeConfig`, owns include patterns/projects and keeps application
Vite plugins out of Vitest. Root `vitest.config.ts` discovers those projects:

```sh
bun --bun vitest run --project '@raypx/core'
bun --bun vitest run --project 'desktop (unit)'
bun --bun vitest list --filesOnly
```

Use root test commands for manifest prerequisites and task caching. DOM setup
extends Vitest's own `expect` with jest-dom matchers; side-effect imports from a
second runner can target the wrong instance. Shared setup removes animation waits.
After an interaction, await explicit state before reading effects: a loaded panel,
a resolved request, enabled control, visible row or recorded port call. Keep the
behavioral assertion; do not substitute arbitrary sleeps, weaken counts or read
an effect before React has applied the state that triggers it.

Shared Agent model suites own stream/cursor application, send receipts, paging,
approval/activity matching, outside-window active-Run projection and targeted
steering, and lifecycle recovery. Feature component suites own
Agent/group conversation, Space management, effects, computer files, routines,
Space memory, Pages, Skills and Tools. Web/Desktop suites own auth, routes and
platform adapters. Default fixtures never invoke paid model inference.

## PostgreSQL and backend gates

The owned POSIX gate requires PostgreSQL binaries (`initdb`, `postgres`,
`pg_isready`, `createdb`) and `redis-server`. Use `TEST_POSTGRES_BIN` or
`TEST_REDIS_BINARY` for explicit executable locations. Without a URL it creates
and stops its own temporary cluster and Redis process:

```sh
bun run test backends
# Existing disposable loopback database: PostgreSQL is not started/stopped/dropped.
bun run test backends --database-url postgres://raypx@127.0.0.1:55439/raypx_next_test_b
```

An explicit URL must select loopback and a `*_test` or `*_test_<lane>` database
without query options. Inherited database URLs never select this gate's target.
Redis remains owned and temporary. API `test:postgres`, `test:redis` and
`test:cluster` run serially; external model execution is disabled. Generated
logs/results live under `.artifacts/backends/`. Run only against a disposable
isolated schema, never a development/operator/retired database.

The aggregate `postgres` suite additionally discovers feature workspace gates:

```sh
TEST_DATABASE_URL=postgres://raypx@127.0.0.1:55439/raypx_next_test_b \
  bun run test postgres --concurrency=1
```

Run workspaces sharing one database serially: worker scans can otherwise lock
another suite's raw-fixture teardown. CI uses PostgreSQL 17. Database-free
migration coverage is not evidence of applying migrations to PostgreSQL.
The backend gate's API mode composes real RPC/auth and feature repositories;
feature modes test their own persistence boundaries. Redis and cluster modes
cover retained device routing and shared counters, not a Redis dependency for new Runs.

Active-Run PostgreSQL cases cover every lifecycle transition, trigger/segment
positions, approval summaries and the history-window boundary. HTTP API cases
cover same-Space keys and membership/owner admission, encrypted input-only
credentials, selected operations, approval classification and durable effects.
Provider suites inject DNS/socket transports to check host pinning, redirect and
private-range refusal, document/schema/response bounds and secret-echo rejection.
RPC/event/log assertions keep credentials out of public projections.

Direct API modes remain available when supplying their required explicit test
URLs: `bun run --cwd apps/api test:postgres`, `test:redis` and `test:cluster`.
Cluster requires both `TEST_DATABASE_URL` and `TEST_REDIS_URL` and real sockets.
The owned gate manages these values without exposing credentials in its manifest.

## Browser suites and owned-backend journeys

From `e2e/`, install Chromium with
`bun --bun playwright install --only-shell chromium`. Then, from the repository root:

```sh
bun e2e
bun e2e --web
bun e2e --desktop settings.spec.ts
bun e2e --web --grep conversation
bun e2e --desktop --list
```

`--list` collects cases without builds or servers. `--dry-run` shows builds.
`--web`, `--desktop`, package selectors and Playwright projects select the same
surface; conflicting choices fail. Smoke and user grep intersect. Focused runs
provide feedback; the complete selected suite is the acceptance gate.

Web `build:e2e` produces the real Nitro Bun output; Desktop `build:renderer`
produces a compiled browser fixture without Go or CLI. Turbo caches builds, while
Playwright always runs. Test flags never enter build cache keys. Test CSS is
excluded from product class scanning. Playwright owns loopback servers and rejects
occupied ports instead of reusing another process. Browser Desktop deliberately
fails native bridge calls; it proves no native IPC or OS session behavior.

Ordinary response fixtures establish renderer behavior. For real PostgreSQL,
authentication, API listeners and deterministic model/tool interactions, run:

```sh
bun run test backends \
  --database-url postgres://raypx@127.0.0.1:55439/raypx_next_test_b \
  --with-e2e -- --workers=1
```

This starts the test-only control API fixture and builds clients with its explicit
origin. The fixture requires `RAYPX_VALIDATION=1` and an isolated test database;
it is not an operator account tool. Owned journeys cover streamed/committed replies
and reload, routines and memory revisions, Page versions/shares/revocation,
Skills/remote MCP approvals, outside-window active Runs, Space OpenAPI tools,
and shared-Space/group/delegation behavior. Each case
owns its account/Space resources. Cases requiring the owned fixture skip without
it; a green ordinary browser run does not imply those journeys ran. Check the
selected inventory and skipped results rather than quoting a fixed case count.

`active-runs.spec.ts` creates an old Run waiting for approval behind more than one
history window, reloads, answers from Still working and jumps to the trigger page.
`openapi-tools.spec.ts` imports a local fixture document, enables read and mutating
operations, executes both through the deterministic model, answers the change
approval and inspects activity/effects. Both run on Web and Desktop with isolated
Spaces. Repeat the new journeys through the owned gate:

```sh
bun run test backends \
  --database-url postgres://raypx@127.0.0.1:55439/raypx_next_test_b \
  --with-e2e -- active-runs.spec.ts openapi-tools.spec.ts \
  --workers=1 --repeat-each=3 --visual
```

Type through the real controls, use explicit short timeouts and measure geometry
only after the surface is at rest. Light strip/API-management screenshots cover
1440×860 and 375×812; generated evidence belongs under `.artifacts/`.

Conversation reading acceptance uses bounded history (at most 200 messages),
explicit older/gap loads, revisions, virtual/full-text switching, focus and reading
position under CPU throttling. It tests actual paging without a huge fixture.
The owned `computer-screen.spec.ts` journey runs on Web and Desktop with a
deterministic provider PNG: it starts Screen, observes frames, takes control,
types, observes another member's control state, releases with Escape, forces
release as owner and stops the session. Its explicit review screenshots are under
`.artifacts/screen/` at 1440×860 and 375×812. Invitation values stay in memory;
trace/video recording is disabled. Ordinary runs skip it without the owned API.
Expansion checks preserve the existing viewer/grant without another stream,
release control on the first Escape, then close the dialog and restore focus on
the next Escape. Native Mobile has no Screen UI; these cases cover both DOM clients.
Page-share journeys disable traces/screenshots while displaying one-time tokens.
Desktop checks the Web handoff and absence of authenticated document frames.

Headless is the default. Reports live under `e2e/test-results/<all|web|desktop>/`.
Failure screenshots remain enabled; CI traces the first retry. `--visual` opts
into maintained screenshots; `--trace on` enables explicit local diagnosis.
Never record real sign-in credentials or one-time secrets in shared traces.

## Sandbox gate

```sh
bun run test sandbox --engine-socket "$HOME/.colima/default/docker.sock"
bun run test sandbox \
  --engine-socket "$HOME/.colima/default/docker.sock" \
  --with-egress --dns-resolver 1.1.1.1 \
  --engine-host-command '["colima","ssh","--","sudo","-n"]'
```

This opt-in gate builds its own computer image, starts an owned source supervisor
and checks provider conformance, container isolation and durable-home replacement.
`--with-egress` explicitly authorizes temporary Linux Engine-host firewall rules.
The VM prefix requires the checkout at the same absolute path; native Linux uses
root/passwordless sudo without that prefix. HTTPS/DNS controls, alternate resolvers,
metadata/private ranges and host-service isolation require network and DROP-counter
evidence. Offline public connectivity or absent IPv6 controls are unavailable.

See [sandbox setup](sandbox.md) and
[real-Engine evidence](validation-artifacts.md#owned-sandbox-real-engine-acceptance).
The recorded macOS arm64/Linux arm64 VM gate passed IPv4 enforcement; IPv6 was
unavailable. Other Engine/platform combinations remain unverified. Default tests
inject the Engine transport and never change firewall rules.

## Mobile checks

```sh
bun run --cwd apps/mobile check
bun run --cwd apps/mobile test
bun run --cwd apps/mobile build
# From apps/mobile:
bun --bun expo install --check
```

The build exports iOS and Android JavaScript bundles; it does not compile native
apps. Native component mocks cover Agent directory/conversation, Markdown,
the active-Run strip, targeted steering, HTTP API activity/approval labels and the
computer sheet, groups/mentions, shared Spaces/invitations, routines, memory
revision restore, Pages handoff and resource enablement/availability; port tests
cover session headers, storage, precise close reasons and AppState resume. Neither proves device layout, keyboard, screen reader or live
socket behavior. The manual unsigned-native build and signed-release workflows
are separate. [Mobile](mobile.md#device-acceptance) lists iOS/Android device checks;
unrun device/simulator/platform acceptance remains unverified.

## Desktop and retained runtime gates

[Desktop release](desktop.md#build-and-release) owns native prerequisites,
`mygo:check`, `mygo:test`, `mygo:smoke`, packaging, signatures and installed GUI
acceptance. Production and `native_smoke` builds are distinct. Quiet smoke never
activates windows; interactive smoke requires an explicit isolated GUI session.
Linux Desktop acceptance remains unverified. Source tests or compiled browser
fixtures are not native-platform passes.

The CLI's [terminal host](terminal-host.md), local lifecycle, SQLite, PTY and
external-provider checks remain for retained device consumers. The lifecycle
fixture uses a synthetic provider and real local storage/transport without a GUI
or PostgreSQL. They do not validate new server Agent journeys. Live model/native
gates are explicit opt-ins and may consume provider usage; do not run them as
part of ordinary verification.

## Inventory, CI and evidence

`bun run test inventory --layers` executes fresh declared layers and checks exact
file selection, case preservation and non-overlap. `.only`, empty placeholder
suites and missing ordinary reports fail the inventory gate. Use
[validation evidence](validation-artifacts.md) for baseline comparison and cleanup.

CI consumes one versioned plan bound to the commit. Source checks/tests, backend,
browser, sandbox, container and native gates run only when selected; the final
result validates every required result and intentional skip. A comparison range containing only documentation normally selects
policy/locales/style without external services. The default merge-base with
`origin/canary` can include earlier committed branch changes; inspect the printed
baseline and selection before interpreting the scope. Report the
actual commands, passes, skips and unavailable checks; never infer an unrun gate.

## Auto review acceptance

Auto review suites inject a deterministic tool-less model for all verdicts,
malformed output, deadlines, confidence and durable per-Run budget. Injection cases
include untrusted Page/tool/API content that asks the reviewer to approve; backend
policy preserves Ask independently of the fixture verdict. PostgreSQL cases cover
claims, recovery without a second review, fences, stop and same-Space keys.

`auto-review.spec.ts` runs on Web and Desktop with the owned backend. An
always-approve reviewer passes a safe requested file write; reload preserves its
automatic label and reason. Reading a Page containing approval instructions makes
the next write ask the member. Repeat it with:

```sh
bun run test backends \
  --database-url postgres://raypx@127.0.0.1:55439/raypx_next_test \
  --with-e2e -- auto-review.spec.ts --workers=1 --repeat-each=3 --visual
```

Opt-in screenshots of the mode picker and automatic row at 1440×860 and 375×812
are written to `.artifacts/auto/`. Real-provider quality, packaged Desktop and
native Mobile device acceptance remain separate from deterministic browser tests.
