# Roadmap

This is the delivery order for the [target architecture](architecture/README.md).
Phase 1 implements Spaces, membership records, Agent CRUD with one direct
Conversation per Agent, and member messages with an ordered event log, snapshots,
an acknowledged event stream and process-local model replies with queued Runs,
transient deltas, committed segments and stop. The shared `/agents` workspace is
the signed-in home in Web and Desktop, with device-local drafts and deterministic
browser fixtures. Acceptance results remain separate gates; client closeout is
not a claim of packaged-platform or live-provider acceptance.

Project/session pages, Waiting, New session and the guest task editor/handoff have
been removed from Web and the Desktop renderer. Dependent Automations screens are
also removed. Earlier standalone Memory remains device/account-owned, separate
from the Agent/Space memory planned in phase 4. The CLI/daemon, native host, device
stores and remote projections remain until a phase replaces them.

## Phase overview

| Phase                       | Delivers                                                     | Depends on |
| --------------------------- | ------------------------------------------------------------ | ---------- |
| 1. Conversation             | Accounts, Spaces, Agents, streamed replies, event stream     | —          |
| 2. Durable Runs             | Leases, attempts, steering, stop, recovery                   | 1          |
| 3. Computers and approvals  | Computer port, Docker provider, tools, approvals, effects    | 2          |
| 4. Routines and memory      | Schedules, inbound triggers, run history, memory             | 3          |
| 5. Pages and connections    | Pages, share links, MCP, app connections, skills             | 3          |
| 6. Shared Spaces and groups | Members, invitations, audit, group conversations, delegation | 2          |
| 7. Devices and reach        | Device connector, full mobile, hosted sandbox, desktops      | 3, 6       |

Each phase is usable by itself. A phase starts when the phases it depends on meet
their acceptance.

Rules for every phase:

- Each acceptance item is checked by a deterministic test unless it says otherwise.
- Deterministic fixtures cover a workflow before any live provider run.
- Live provider runs are opt-in and report their provider, model and platform.
- Packaged Desktop, PostgreSQL, browser and mobile acceptance are separate gates,
  reported per platform. An unrun platform is reported as unrun.
- A phase removes the code and guides it replaces. It adds no compatibility path
  and no import of earlier data.

The disposable, unreleased `next` PostgreSQL schema now has one generated baseline.
Database-free migration coverage checks its current tables and columns; clean
PostgreSQL 17 application and concurrent-startup acceptance passed on an empty
disposable database on 2026-11-14. Released changes will append migrations.

## 1. Conversation

Accounts, a private Space per account, Agents, one conversation per Agent, streamed
replies and the event stream. No tools. See [domain](architecture/domain.md) and
[events](architecture/events.md).

Acceptance:

- A message commits and the request returns before the reply completes.
- A reconnecting client resumes from its cursor with no gap and no duplicate. A
  cursor older than the retained log receives a snapshot.
- A record in one Space cannot be read through any procedure from another Space.
  A cross-Space foreign key fails in the database.
- A reply streams as deltas and is committed as one segment. A client that joins
  mid-segment shows the same final text.
- The same conversation renders in Web and Desktop.

Client replacement: `/agents` now leads signed-in navigation and sign-in defaults.
Web and Desktop no longer expose project/session or pending-approval pages, the
guest editor or draft handoff. Desktop also removes project Files, Terminal,
onboarding and old execution settings from its renderer. Device-owned backend,
CLI and Go code is retained for later removal; phase 1 does not migrate its data.
Account/security, administration/configuration, sign-in/sign-up, public Web pages
and device preferences remain reachable.

## 2. Durable Runs

Leases, attempts, checkpoints, steering, stop and recovery. See
[execution](architecture/execution.md).

Implemented backend: PostgreSQL execution leases with fencing and heartbeats,
attempts and canonical turn checkpoints, direct dispatch with a keyed backup
queue, worker startup/interval recovery, graceful handover, pinned resources and
steering during running/approval-waiting Runs. Runtime construction performs no
recovery I/O. Default `SERVER_ROLE=all` combines API, worker and Relay; API/worker
coordination needs PostgreSQL only. Client UI is a separate slice. PostgreSQL and
loopback `/events` acceptance remain separate gates; implementation does not claim
an unrun database or listener check passed.

Acceptance:

- Two processes that start the same Run execute it once.
- Killing the owning process mid-Run leads to a resume from the last checkpoint
  within the scan interval.
- A write with an older fence is rejected.
- A message during an active Run steers it. Stop ends it and records `cancelled`.
- A stuck Run does not delay the start of another Run.
- Active Runs remain visible outside the loaded history window after reload;
  members can stop, steer, answer approvals or load the Run's trigger page.
- A process that receives a stop signal releases its Runs, and another process
  resumes them.
- A resume uses the pinned model and connection. A missing one fails the Run with
  an explicit state.

Replaces: the CLI's private Agent harness and its event-sourced orchestration for
Pi work.

## 3. Computers and approvals

The Computer port, the Docker provider and supervisor, file and command tools,
approval modes, lists and effects. See [computers](architecture/computers.md) and
[approvals](architecture/approvals.md).

Implemented backend second slice: bounded Computer tool rounds, lazy start,
Ask/Never ask account settings, exact Allow/Block rules, addressed expiring
approvals, conversation card events, cancellation and durable effect intents/
outcomes with unknown-outcome guards. Auto review, protected input, client UI and
durable Run recovery remain outside this slice. PostgreSQL, loopback stream and
live Docker acceptance remain separate, unclaimed gates.

Backend egress follow-up: the supervisor selects one DNS upstream and host rules
restrict direct UDP/TCP DNS to it. The real-Engine gate now checks public HTTPS,
configured/alternate DNS, host-service/gateway isolation, metadata and private
ranges with network controls and DROP-counter evidence. Offline public reachability
is explicitly unavailable. On 2026-11-14, the real-Engine gate passed provider
conformance (10/10), isolation, home replacement and IPv4 egress enforcement on
a Linux arm64 Engine VM. IPv6 enforcement was unavailable because the host
disables IPv6; other platform acceptance remains separate. This adds no Agent browser tool or hosted
computer capability.

Acceptance:

- The conformance suite passes for the in-memory and Docker providers.
- A home survives a replaced container. An older generation cannot write it. A
  failed restore keeps the last known-good revision.
- A command in a container cannot read the Docker socket, the host network or
  another Space's home.
- The backend process holds no Docker socket.
- A change waits for its approval in Ask mode. A blocked action is refused with no
  card. An allowed action runs with no card.
- Only the addressed member can answer an approval. A pending approval does not
  block a new message.
- An effect with an unknown outcome is never retried automatically.
- A secret supplied as protected input appears in no event, checkpoint or log.
- A live Docker run is recorded per platform. It is opt-in.

Replaces: root-grant file tools and host command execution as the default path.

## 4. Routines and memory

Schedules, webhook, email and repository triggers, run history, and Agent and
Space memory. See [capabilities](architecture/capabilities.md).

Backend slice: Space routines and versioned Agent/shared memory use PostgreSQL,
normal direct Run dispatch, worker-only scans, durable deduplication/coalescing,
independent ingress credentials, untrusted-input approval and checkpoint-pinned
recall. Existing account/device Memory and jobs remain for retained consumers;
no data is imported. Client delivery and PostgreSQL/loopback acceptance are
separate gates; an unrun database or listener is not claimed as passed.

Acceptance:

- One occurrence starts one Run. A repeated delivery with the same key starts none.
- A recurring routine keeps at most one pending catch-up Run.
- A Run that starts at least 15 minutes late is told its due time and its actual
  time, and the history shows the delay.
- A write in a webhook-started Run asks for approval in Ask and Auto.
- An Agent recalls only its own memory and memory shared in its Space.
- Removing a memory creates a revision, and the removed text is no longer recalled.

Replaces: device-local Cron jobs, the local routine ingress and device-owned
memory.

## 5. Pages and connections

Pages with versions and share links, MCP servers, app connections, OpenAPI tools
and skills. See [capabilities](architecture/capabilities.md).

Backend slice: immutable Pages with CAS/restore and hashed revocable share links,
sandboxed public/member document serving, text-only skills with non-executing
Markdown/ZIP imports, and member-owned remote HTTP MCP servers use the existing
approval/effect/secret-store path. Enabled skill metadata and remote tool catalogs
are checkpointed for recovery. Model connections were already implemented.
Space-owned OpenAPI tools now import bounded documents once, expose selected
operations with encrypted credentials through the existing approval/effect path,
and pin HTTP egress through the remote-tool resolver. Web/Desktop owners manage
them beside remote servers; Mobile shows activity and addressed approvals.
Managed app connectors remain outside this slice. Client delivery,
PostgreSQL and loopback HTTP acceptance remain separate gates; an unrun database
or listener is not claimed as passed.

Backend follow-up: successful Page tool writes expose their server-produced Page
ID and version in live and retained tool activity, with same-Space historical
identity after deletion. Markdown member/share documents include neutral light/dark
document styling authorized by an exact CSP hash. HTML documents retain their
authored content. These changes add no client navigation or editor behavior.

Acceptance:

- A share link exposes one page. Revoking it makes the page unreadable on the next
  request.
- A page cannot read the session or call the API as the member.
- A connection belongs to one member. Another member's Run cannot use it.
- An item is available in the Spaces its owner chose, including Spaces created
  later when the owner chose all.
- Installing a skill or an MCP server runs no third-party code in the backend
  process. Left-out parts are named.
- Importing an OpenAPI document executes no code. API tools stay within their
  registered host, refuse private addresses/redirects, and distinguish reads from
  changes under the same approval rules and effect lifecycle.

## 6. Shared Spaces and groups

Members, invitations, audit history, group conversations and delegated work. See
[spaces](architecture/spaces.md).

Backend membership slice: owner/member management, profile-based member directory,
single-use seven-day invitations, owner approval-mode overrides, append-only Space
audit, live Space events and resumable claimed Space deletion are implemented.
Removal revokes admission/streams, cancels active Runs and approvals, pauses owned
routines and clears connection selections while retaining conversation history.
The backend group/delegation slice adds structural mentions, optional group default
responders, concurrent Agent replies, bounded Agent messaging and durable child
Runs with inherited authority, cancellation and recovery. Membership/group UI
remains separate work. PostgreSQL and loopback acceptance are authored but remain
separate, unrun gates in a sandbox that cannot host a database or listener.

Acceptance:

- An invitation works once and expires after seven days. Joining grants nothing in
  the inviter's other Spaces.
- Removing a member ends their access on the next request and closes their event
  subscriptions.
- A deployment administrator who has not joined a Space cannot read it.
- A Run uses the credentials of the member who started it.
- In a group, a message reaches the Agents it mentions.
- Delegated work runs while its parent keeps answering. It gains no authority the
  parent lacks.
- Every membership, invitation and grant change appears in the audit history,
  including refusals. Missing audit storage blocks the write.

## 7. Devices and reach

The device connector as a computer, the full mobile client, one hosted sandbox
provider, and graphical desktops with takeover. See
[computers](architecture/computers.md#device-connectors) and
[clients](architecture/clients.md).

Acceptance:

- The conformance suite passes for the device and hosted providers.
- A device grant needs native confirmation. Revoking it cancels its work. An
  offline device is a waiting state.
- A device runs only Runs started by the member who granted it.
- A hosted sandbox receives content only through the Computer port. The backend
  holds the provider key; no client does.
- A takeover gives one person exclusive control of one screen and releases it on
  disconnect.
- Packaged Desktop and Mobile acceptance are recorded per platform.

Replaces: instance enrollment, the daemon-owned Desktop channel and the terminal
host.

## Not planned

Billing and seats, SCIM and enterprise SSO, a public plugin marketplace, messaging
channels and voice, a visual workflow builder, and more than one hosted sandbox
provider. Each needs its own decision when a concrete workflow requires it.

## Open questions

- Which hosted sandbox provider passes the conformance suite and fits the port.
- Whether the first release ships Auto review or only Ask and Never ask.
- Whether Claude and Codex continue as tools inside a computer or are dropped.
