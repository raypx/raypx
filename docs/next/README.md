# Next platform plan

Status: proposal on the `next` branch. Nothing here is implemented. `PRODUCT.md`,
the [current architecture](../architecture/README.md) and the
[roadmap](../roadmap.md) describe the shipped product on `canary` and stay
unchanged until a phase below replaces them.

This plan starts from a clean design and reuses the current toolchain and shared
packages. It does not keep the device-owned execution model. Where it differs from
an accepted decision, a new ADR supersedes that decision before the work starts.
See [decisions to record](#decisions-to-record).

## Purpose

Raypx becomes the durable home for persistent Agents. An Agent has an identity, one
continuing conversation, memory, routines and a computer. It keeps working while
the person is away and on any device they sign in from. People can share a Space
and work with the same Agents.

## Principles

- One authority. PostgreSQL holds every Agent, conversation, Run and approval.
  Clients express intent and render state.
- The operator owns the deployment. The complete product runs on infrastructure
  the operator controls. Every external service is optional and sits behind a
  provider-neutral port.
- A Space is the authorization boundary. Nothing crosses between Spaces implicitly.
- A computer is a durable place. Its home survives a stopped, restarted or replaced
  container.
- The Agent runtime stays outside the computer. Credentials never enter it.
- Memory and prompt text are context. They never authorize an action.
- Show real execution, failures and retry state. Never claim an external effect
  happened exactly once.
- Tests are deterministic and offline by default. Live provider runs are opt-in.

## Topology

```text
Web / Desktop / Mobile
        │  oRPC + event stream
        ▼
   backend (role: api)  ◄── LISTEN/NOTIFY ──►  backend (role: worker)
        │        │                                   │
        │        └────────── PostgreSQL ─────────────┘
        │
        ├── Computer port ──► sandbox supervisor ──► Docker containers
        │                 ├─► hosted sandbox provider
        │                 └─► device connector (outbound WebSocket)
        └── model endpoints, object storage, mail
```

- One backend artifact runs as `api`, `worker` or both. The default is both in one
  process. Redis stays optional.
- Pi runs inside the backend process. A Run's tools call the Computer port.
- The sandbox supervisor is a separate service. It alone holds the Docker socket.
- The device connector is the bundled CLI daemon. It connects outbound and offers
  the registered device as a computer for selected directories.

## Domain model

| Record           | Meaning                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| Space            | Authorization boundary. Every record below carries its Space.              |
| Space member     | An account's `owner` or `member` role in one Space.                        |
| Agent            | A persistent identity with instructions, a model choice and a computer.    |
| Conversation     | The one continuing thread of an Agent, or a group of Agents.               |
| Message          | A visible entry in a conversation.                                         |
| Run              | One unit of Agent work, started by a message, a routine or another Agent.  |
| Attempt          | One execution of a Run. A retry or a resume adds an attempt.               |
| Steering message | Input that arrives while a Run is active and redirects it.                 |
| Effect           | A recorded intent and outcome for each action that changes something.      |
| Approval         | A request addressed to one member, with the exact tool and arguments.      |
| Event            | An ordered entry in a conversation's stream.                               |
| Computer         | A durable workspace with a provider, a home revision and leases.           |
| Routine          | A saved prompt with a schedule or an inbound trigger.                      |
| Memory document  | Versioned knowledge that belongs to one Agent or to its Space.             |
| Connection       | A member's credentialed link to a model, an app or an MCP server.          |
| Page             | A document or dashboard an Agent maintains, with versions and share links. |

Every table carries `space_id`. Repositories take a Space scope as a required
argument and filter on it. No query reads across Spaces.

## Workspaces

| Workspace            | Role in this plan                                                        |
| -------------------- | ------------------------------------------------------------------------ |
| `apps/api`           | Composition root for the `api` and `worker` roles.                       |
| `apps/web`           | TanStack Start client for every workflow.                                |
| `apps/desktop`       | MyGo host around the Web UI. It launches the device connector.           |
| `apps/cli`           | The device connector daemon and operator commands.                       |
| `apps/mobile`        | Expo client that shares Core and contracts.                              |
| `infra/sandbox`      | New. The supervisor service and the computer image.                      |
| `packages/core`      | Domain schemas and pure rules for the records above.                     |
| `packages/contracts` | oRPC wire definitions.                                                   |
| `packages/providers` | Ports and their adapters: computer, model access, memory, connections.   |
| `packages/database`  | Drizzle schema and migrations.                                           |
| Kept as they are     | `auth`, `account`, `ui`, `blocks`, `i18n`, `email`, `storage`, `logger`. |

Feature packages such as `tasks`, `memory` and `jobs` are reshaped around the new
records. A package is added only when a second consumer needs it.

Toolchain: Bun 1.4.4, Turbo, Vite+, standalone Vitest, Drizzle, Better Auth, Hono,
oRPC and Pi. The existing policy, verification and release gates apply unchanged.

## Run execution

- Work starts at once in the process that creates it. The request that commits a
  message returns immediately and the client follows the reply on the event stream.
- Starting a Run claims an execution lease with one atomic update. The lease has a
  fence number and a heartbeat. A write with an older fence is rejected.
- A worker scans for runnable Runs at startup and on a short interval. It starts
  any whose process died, whose lease expired or whose start was lost.
- A process that is shutting down releases its Runs. Another process resumes them
  from the last committed attempt.
- A message that arrives during an active Run steers that Run. It does not queue a
  second one.
- An Agent uses its computer for one Run at a time. A second Run that needs the
  computer waits. Conversation continues while it waits.
- The queue is a durable backup, never the normal path. The transaction that
  records work also records a job due after that attempt's timeout. Success deletes
  the job. A crash lets it fire.
- A Run records its model, connection and computer. A resume uses the same ones. A
  missing one fails the Run with an explicit state.

## Event stream

- Each conversation has one ordered event log in PostgreSQL. Visible text, cards,
  progress and state changes are events.
- A client reads from a cursor and acknowledges it. A gap forces a snapshot before
  incremental events resume.
- Processes notify each other through PostgreSQL `LISTEN/NOTIFY`. A configured
  Redis broker replaces it for larger deployments.
- The first visible response is committed in the same transaction as its event.

## Approvals and effects

- Three modes: ask before every change, review automatically, or never ask.
  Automatic review uses a separate model and asks when it errors or is unsure.
- Allow and Block lists name exact tools and sites. A blocked action is refused in
  every mode without a card.
- An action that outside text could have steered still asks, including writes in a
  Run started by a webhook or an inbound email.
- Each action that changes something records an effect intent before it runs and an
  outcome after. An effect with an unknown outcome blocks automatic retry and is
  shown for inspection.
- An approval names the exact tool, arguments and resource version. Only the
  member it is addressed to can answer it. A pending approval never blocks the
  conversation.
- A deployment chooses its default mode. The product works with no review model.

## Computers

The Computer port covers lifecycle, command execution with cancellation, bounded
file access, and export, import and snapshot of the home.

| Provider | Runs on                        | Boundary                                   |
| -------- | ------------------------------ | ------------------------------------------ |
| `docker` | The supervisor's Docker Engine | The container                              |
| hosted   | One hosted sandbox service     | The provider's sandbox                     |
| `device` | A registered device            | Granted directories; the user's OS account |

- A Space has one shared computer by default. An Agent can use a private computer
  when its files must stay apart.
- A computer starts when a Run first needs it and stops when idle.
- Every lifecycle operation carries a generation. An older generation cannot write
  the home after a replacement.
- A Run's computer is fixed. An unavailable computer is a waiting or failed state.
  A Run never moves to another computer by itself.
- The supervisor applies memory, CPU and process ceilings. It reports the limits it
  cannot enforce, such as egress restriction.
- The `device` provider asks for native confirmation on the device. The grant
  belongs to one account and ends with that account's session.
- One conformance suite runs against an in-memory provider and every real provider.

Graphical desktops, browser tools, screen streaming and user takeover extend the
same port in a later phase.

## Spaces and membership

- A new account gets one private Space. A person adds a Space to keep work apart.
- Space roles are `owner` and `member`. They are separate from the deployment
  roles. A deployment administrator cannot read a Space they have not joined.
- An invitation is a single-use link that expires after seven days. The server
  stores only its hash. Joining one Space grants nothing in another.
- Members share Agents, conversations, memory, routines and the Space computer.
- Each member keeps their own model credentials, connections and approval rules.
  A Run uses the credentials of the member who started it. A routine runs as its
  owner.
- Settings such as models and approval mode are account defaults. A Space overrides
  one only as a deliberate exception.
- Membership, invitation, grant and approval changes are audited, including
  refusals.

## Clients

- Web is the complete client. Desktop hosts the same UI and adds the device
  connector, notifications and native sign-in. Mobile shares Core and contracts.
- A workflow works on every client or degrades for a stated reason.
- Keep the neutral visual system, keyboard focus, accessible labels, reduced motion
  and English and Chinese copy.
- Chat shows the reply, useful progress, results and requests for help. Tool
  lifecycle stays in an activity view.

## Security boundaries

- Model credentials, sessions and connector tokens stay in the backend's encrypted
  secret store. A computer receives a secret only for the command that needs it.
- The supervisor is not exposed outside the private network. API reaches it with a
  dedicated token.
- Inbound webhooks and email are untrusted input. They can start a Run but cannot
  approve an action.
- Sharing an Agent copies its configuration. It never copies its computer,
  credentials, files, private memory or history.
- Logs carry no prompts, credentials, private paths or file content.

## Delivery phases

Each phase is usable by itself. A phase starts when the previous one meets its
acceptance. Every item is checked by a deterministic test unless it says otherwise.

### 1. Conversation

Accounts, a private Space, Agents, one conversation per Agent, streamed replies and
the event stream. No tools.

- A message commits and the request returns before the reply completes.
- A reconnecting client resumes from its cursor with no gap and no duplicate.
- A record in one Space cannot be read through any procedure from another Space.
- The same conversation renders in Web and Desktop.

### 2. Durable Runs

Leases, attempts, steering, stop and recovery.

- Two processes that start the same Run execute it once.
- Killing the process mid-Run leads to a resume from the last committed attempt
  within the scan interval.
- A message during an active Run steers it. Stop ends it and records the state.
- A stuck Run does not delay another Run's start.

### 3. Computers and approvals

The Computer port, the Docker provider, file and command tools, approval modes,
lists and effects.

- The conformance suite passes for the in-memory and Docker providers.
- A home survives a replaced container. An older generation cannot write it.
- A command cannot read the Docker socket, the host network or another Space's
  home.
- A change waits for its approval in Ask mode. A blocked action is refused with no
  card.
- An effect with an unknown outcome is never retried automatically.
- A live Docker run is recorded per platform. It is opt-in.

### 4. Routines and memory

Schedules, webhook and inbound email triggers, run history, Agent and Space memory.

- One occurrence starts one Run. A repeated delivery with the same key starts none.
- A Run that starts late is told its due time and its actual time.
- A write in a webhook-started Run asks for approval in the Ask and automatic modes.
- An Agent recalls only its own memory and memory shared in its Space.

### 5. Pages and connections

Pages with versions and share links, MCP servers, app connections and skills.

- A share link exposes one page. Revoking it makes the page unreadable on the next
  request.
- A connection belongs to one member. Another member's Run cannot use it.
- An installed skill or MCP server runs no third-party code in the backend process.

### 6. Shared Spaces and groups

Members, invitations, audit history, group conversations and delegated work.

- Removing a member ends their access on the next request.
- Only the addressed member can answer an approval. A second answer is rejected.
- Delegated work runs while its parent keeps answering. It gains no authority the
  parent lacks.
- Every membership and grant change appears in the audit history, including
  refusals.

### 7. Devices and reach

The device connector as a computer, the full mobile client, one hosted sandbox
provider, and graphical desktops with takeover.

- The conformance suite passes for the device and hosted providers.
- Revoking a device grant cancels its work. An offline device is a waiting state.
- A takeover gives one person exclusive control of one screen and releases it on
  disconnect.
- Packaged Desktop and Mobile acceptance are recorded per platform.

## Not planned

Billing and seats, SCIM and enterprise SSO, a public plugin marketplace, messaging
channels and voice, a visual workflow builder, and more than one hosted sandbox
provider. Each needs its own decision when a concrete workflow requires it.

## Decisions to record

Write these ADRs before the phase that depends on them:

| Decision                                                 | Supersedes or amends       | Before phase |
| -------------------------------------------------------- | -------------------------- | ------------ |
| Server-owned Agents with PostgreSQL as the one authority | ADR 0035, ADR 0039         | 1            |
| Agent and conversation in place of project and session   | Product scope and glossary | 1            |
| Direct Run dispatch with leases and a backup queue       | ADR 0044                   | 2            |
| Computer port and the sandbox supervisor                 | ADR 0065                   | 3            |
| Shared Spaces before device Spaces                       | ADR 0065                   | 6            |
| The CLI daemon as a device connector                     | ADR 0052, ADR 0054         | 7            |

## Open questions

- Whether existing device-local profiles get an export path into a Space or stay
  on the current product line.
- Which hosted sandbox provider passes the conformance suite and fits the port.
- Whether the backup queue reuses the Jobs feature or needs its own table.
- Whether the first release ships the automatic review mode or only Ask and Never.
