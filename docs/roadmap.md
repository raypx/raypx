# Pi product roadmap

Pi is the priority for new Agent capabilities. Build the daily local workflow on
Desktop and CLI first. [Product scope](../PRODUCT.md) and the
[current architecture](architecture/README.md) describe the available features.
Release evidence follows the [testing gates](development/testing.md) for each
candidate and platform.

## Phase overview

Phases are delivered in this order. A phase starts when the phases it depends on
meet their acceptance criteria.

| Phase                                 | Status                                            | Depends on                    |
| ------------------------------------- | ------------------------------------------------- | ----------------------------- |
| 0. Current foundation                 | Delivered                                         | —                             |
| 1. Local Pi Run review                | Implemented; live packaged acceptance open        | 0                             |
| 2. Pi recovery and acceptance         | Started: single-approval recovery delivered       | 1                             |
| 3. Local Pi automations               | Triggers delivered; routine authoring open        | 1; Slack trigger also needs 6 |
| 4. Named Agents and project artifacts | Not started                                       | 2, 3                          |
| 5. Explicit server ownership          | Not started; design in ADR 0039                   | 2, 4                          |
| 6. Team work and messaging            | Not started                                       | 5                             |
| 7. Clients and extensibility          | Not started; items join a phase when it needs one | —                             |

Status describes the source implementation. "Delivered" needs passing source
checks and deterministic tests. Packaged Desktop, live provider, PostgreSQL and
browser acceptance are separate gates, reported per platform. An unrun platform
is reported as unrun.

Every phase keeps these rules:

- Each acceptance item names a test, a command or recorded evidence.
- Deterministic fixtures cover the workflow before any live provider run.
- Live provider runs are opt-in and report their provider, model and platform.
- Device-owned work stays on the device. Nothing local is uploaded automatically.
- Prompt instructions are never authorization. External effects are never
  claimed to be exactly-once.

## 0. Current foundation

The independent Bun CLI daemon owns local sessions, processes, approvals,
scheduling and profile SQLite. Desktop is its MyGo/Go client. One-time
account/origin-bound enrollment permits subsequent offline work. Claude, Codex
and device-local Pi use the private CLI harness; `AgentTask` remains the persisted
Run record. Remote opt-in exposes scoped device work through Relay and API read
projections; it does not transfer Agent ownership to the server.

Pi already supports model selection, Plan and Run modes, approved project tools
and continuation from saved context. See [managed Pi tasks](development/ai.md#managed-pi-tasks).

## 1. Local Pi Run review

Desktop and CLI show bounded, read-only Git snapshots before and after a device-local
Pi Run. A single remaining tool approval can survive an owner restart. See
[managed Pi tasks](development/ai.md#managed-pi-tasks) for the user flow and limits.

Remaining work is acceptance. Exercise the workflow with a synthetic project and
a deterministic model fixture. Collect separate, opt-in live Pi acceptance for
packaged Desktop and CLI on macOS and Windows.

Acceptance:

- A deterministic fixture run shows the starting and final snapshots in Desktop
  and in `raypx tasks diff`, including changes committed during the Run.
- A missing Git baseline, an unavailable repository and over-limit output each
  appear as unavailable.
- Live packaged runs on macOS and Windows each cover model setup, a rejected
  action, an approved change and continuation after reconnecting to the daemon.
- Evidence records the candidate, platform, provider and model, without prompts,
  credentials, private paths or file content.

Outside this phase: editing or reverting changes from the review, and review of
Claude, Codex or remote Runs.

## 2. Pi recovery and acceptance

Delivered: an interactive Pi Run waiting on a single remaining tool approval
recovers that approval after the execution owner restarts. An unresolved effect
intent blocks continuation.

Extend failure injection around receipts, approvals, effect intents and
projections. Test duplicate delivery, process loss during a pending decision,
interrupted writes and reconnecting event cursors. Recover committed history.
Keep uncertain external effects inspectable and block their automatic replay.

Exercise long-running Pi work while Desktop is closed, reconnect to the same
daemon, and verify explicit daemon stop drains owned work. Test history and memory
backup and restore separately from process recovery. Follow the
[Agent acceptance guide](development/agent-quality.md) and
[Desktop release guide](development/desktop.md#build-and-release).

Acceptance:

- Deterministic failure-injection tests cover each named fault: duplicate
  delivery, process loss during a pending decision, an interrupted write and a
  reconnecting event cursor.
- After each fault, committed history reads back unchanged, and no tool effect
  runs a second time without a new approval.
- An effect with an unknown outcome is visible in Desktop and CLI, blocks
  continuation, and is never replayed automatically.
- A Pi Run continues with Desktop closed. Reopening Desktop attaches to the same
  daemon and shows the Run without a gap or a duplicate event.
- An explicit daemon stop drains or cancels every owned Run and records the
  final state of each.
- A profile's history and memory restore from a backup into a clean profile on
  the same account and origin. The test runs separately from process recovery.

Outside this phase: recovery after a host or OS restart, recovery of multi-call
batches with other outstanding tool calls, and automatic retry of external effects.

## 3. Local Pi automations

Delivered: local Cron jobs can start a Pi session with a saved instruction in an
authorized project. They support pause and resume, manual tests, one run per
scheduled occurrence and history links to the session. Webhook, authenticated
inbound email, GitHub repository events and project file changes can trigger the
same routine. The daemon uses the interactive execution and approval path. Missed
scheduled occurrences are skipped. See
[local Pi automations](development/ai.md#local-pi-automations).

The rest of the automation phase covers creating a routine from a session,
choosing its model and frozen references, and verifying live delivery and provider
execution. Slack triggers depend on the Slack connection in the messaging phase.

Acceptance:

- A routine created from a session keeps that session's project and instruction,
  and starts nothing until the user saves and enables it.
- A routine stores its own model selection. A missing or changed model connection
  fails the occurrence with an explicit state and never falls back to another model.
- A routine captures the selected reference revisions. Later edits to a memory or
  template do not change what the routine sends.
- Each trigger type has one recorded live delivery through its real ingress path:
  Webhook, email relay, GitHub event and file change. A repeated delivery with
  the same idempotency key starts one session.
- One opt-in live provider run starts from a trigger and waits for approval on the
  interactive path.

Outside this phase: catching up missed occurrences, unattended approval of file
mutations or commands, and Slack triggers.

## 4. Named Agents and project artifacts

Give a project multiple named Agents with their own instructions, model,
sessions, memory and automations. Add MCP connections and reusable Skills with
project-scoped permissions. Start with private reports and dashboards that a
routine can update, then add explicit link sharing and revocation.

Acceptance:

- Two named Agents in one project keep separate instructions, model defaults,
  sessions, memory and automations. Neither reads the other's memory without an
  explicit reference.
- Existing sessions and routines stay readable under the project after the change,
  with no automatic import of older data formats.
- An MCP connection or Skill is usable only in the projects that granted it. Each
  tool call follows the existing approval path, and revoking the grant blocks the
  next call.
- A routine updates a private report without a new approval for the report
  itself. The report is readable only on the owning device until shared.
- A shared link exposes one named artifact. Revoking the link makes it unreadable
  on the next request.

Outside this phase: Agent teams, delegation between Agents and a public plugin
marketplace.

## 5. Explicit server ownership

The longer-term ownership model is in [ADR 0039](architecture/0039-local-server-agent-platform.md).
After the local workflow is proven, support reviewed export/import into one
headless instance of the same CLI runtime with a persistent SQLite profile.
Preview portable configuration, memory and history; exclude secrets and project
content by default. Change ownership only after import succeeds and the user
chooses whether to retain or retire the local copy. Do not silently synchronize
two authorities for the same Agent.

Start with a server-owned project. Pair a Desktop only when that Agent needs a
local project, using scoped, revocable grants and acknowledged cursor recovery.
An unavailable Host must wait or fail explicitly rather than switching workspaces.
The server owns the migrated Run; the paired Host owns only its granted local
execution. These are future capabilities, separate from current remote access.

Extend this phase with browser and desktop viewing and user takeover, private
sandbox computers, and Web and mobile session access. Keep the same execution and
approval semantics across clients.

Acceptance:

- The export preview lists every included item. Secrets and project content are
  excluded unless the user selects them.
- A failed or interrupted import leaves the local Agent as the only authority.
- After a successful import, exactly one instance accepts new Runs for that Agent.
  The other refuses with an explicit state.
- A paired Host executes only inside its granted project. Revoking the grant
  cancels the affected work, and an offline Host produces a waiting or failed
  state.
- Reconnecting clients resume from an acknowledged cursor without a gap or a
  duplicate event.

Outside this phase: horizontal workers, multi-tenant Agent storage,
object-storage snapshots and container or VM execution.

## 6. Team work and messaging

Add shared spaces with explicit membership, project grants and audit history.
Add group chat, Agent delegation, shared computer access and a ticket board as
consumers of those boundaries. Connect messaging channels and voice once the
shared session and approval flows can be recovered across clients.

Acceptance:

- A member reads and acts only within projects granted to their space. Removing
  the membership ends access on the next request.
- Membership, grant and approval changes are recorded in audit history, including
  refusals.
- An approval answered by one member resolves for every client, and a second
  answer is rejected.
- A messaging channel starts or answers a session only through an explicit,
  revocable connection bound to one space.

## 7. Clients and extensibility

These items have no fixed order. Each joins a phase when that phase needs it.

- Consider remote Pi access after the local workflow is proven. Require scoped
  Host grants and explicit authorization for remote execution and approvals.
- Extend client parity as supported workflows need it. Mobile currently provides
  the account and login baseline.
- Add MCP/connectors when actual consumers establish a shared tool boundary.
- Import Agent configuration only with preview, explicit selection and executable
  content disabled by default.
- Maintain the existing Claude and Codex integrations. Revisit additional providers
  when a concrete workflow needs one.

## Deferred

Defer Agent teams, a public plugin marketplace, horizontal workers, multi-tenant
Agent storage, object-storage snapshots and container/VM execution until concrete
workflows establish their need. Never treat prompt instructions as authorization
or claim exactly-once external effects. Measure response and recovery behavior
without logging prompts, credentials, private paths or file content.
