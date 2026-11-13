# Roadmap

This is the delivery order for the [target architecture](architecture/README.md).
Phase 1's additive slices implement Spaces, membership records, Agent CRUD with
one direct Conversation per Agent, and member messages with an ordered event log,
snapshots, an acknowledged event stream, and process-local model replies with
queued Runs, transient deltas, committed segments and stop. UI for these records
remains to be implemented. The earlier device-owned product
remains until a phase replaces it.

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

Replaces: project and session pages, the guest task editor and remote read
projections.

## 2. Durable Runs

Leases, attempts, checkpoints, steering, stop and recovery. See
[execution](architecture/execution.md).

Acceptance:

- Two processes that start the same Run execute it once.
- Killing the owning process mid-Run leads to a resume from the last checkpoint
  within the scan interval.
- A write with an older fence is rejected.
- A message during an active Run steers it. Stop ends it and records `cancelled`.
- A stuck Run does not delay the start of another Run.
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

Acceptance:

- A share link exposes one page. Revoking it makes the page unreadable on the next
  request.
- A page cannot read the session or call the API as the member.
- A connection belongs to one member. Another member's Run cannot use it.
- An item is available in the Spaces its owner chose, including Spaces created
  later when the owner chose all.
- Installing a skill or an MCP server runs no third-party code in the backend
  process. Left-out parts are named.

## 6. Shared Spaces and groups

Members, invitations, audit history, group conversations and delegated work. See
[spaces](architecture/spaces.md).

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

- Whether earlier device-local profiles get an export path into a Space.
- Which hosted sandbox provider passes the conformance suite and fits the port.
- Whether the first release ships Auto review or only Ask and Never ask.
- Whether Claude and Codex continue as tools inside a computer or are dropped.
