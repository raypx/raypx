# ADR 0065: Spaces and sandbox computers

Date: 2026-11-13

Status: Accepted for planning. This defines a target; `PRODUCT.md` and the
[current architecture](README.md) remain the shipped baseline until each part is
implemented. It refines the Computer contract and the collaboration model in
[ADR 0039](0039-local-server-agent-platform.md) and replaces the roadmap's deferral
of container execution. The delivery order is in the [roadmap](../roadmap.md).

## Context

A local profile holds all of a person's projects, sessions, memory and automations
in one scope. Work for different clients or purposes cannot be kept apart, and
nothing can be shared with another person. Every tool also runs with the user's OS
permissions: a root grant limits the built-in file operations, but an approved
command can reach anything the user can.

ADR 0039 already requires one authority per Agent, a paired Host that acts as a
Computer provider, and a later container or VM provider behind the same Computer
contract. It leaves two things open: the boundary that shared work lives in, and
the shape of that contract.

## Decision

### Spaces

A Space is the authorization boundary for projects, sessions, memory, automations,
computers and connections. Nothing crosses between Spaces implicitly. A reference,
a memory or a computer from another Space is unavailable, never a fallback.

There are two kinds of Space. Each has one authority.

- A device Space belongs to one local profile and lives in its SQLite store. It
  has one Owner and works offline. Every profile has a default device Space that
  holds its existing device-owned work.
- A shared Space belongs to the server. Its Agents, sessions, Runs, approvals and
  event stream are server-owned, as ADR 0039 defines for a server instance. Each
  member reaches it through an online session.

A device Space never becomes shared in place. Moving work into a shared Space is
the reviewed export/import of ADR 0039. It excludes secrets and project content by
default, and the server becomes authoritative only after the import succeeds.

API owns shared Space membership, invitations and audit history in PostgreSQL.
The server runtime store holds Space-owned Agent state and is keyed by Space. The
first implementation uses one persistent SQLite profile per shared Space. A later
PostgreSQL store must pass the same domain conformance suite.

Membership rules:

- Space roles are `owner` and `member`. They are separate from the deployment
  roles `member` and `admin`. A deployment administrator gets no access to a Space
  they have not joined.
- An invitation is a single-use link that expires after seven days. The server
  stores only its hash. An owner can cancel open invitations. Joining one Space
  grants nothing in the inviter's other Spaces.
- Removing a member ends their access on the next request and revokes the Host
  grants they gave to that Space.
- Membership, invitation, grant and approval changes are audited, including
  refusals. Missing audit storage blocks these writes.

Members share the Space's projects, sessions, memory, automations and computers.
Each member keeps their own model credentials, connections and approval rules. A
Run records the member who started it, uses that member's credentials, and sends
its approval requests to that member only. An automation runs as its owner.

A member may pair a Host to a shared Space for selected projects. The grant binds
the account, the Space, the host generation and the project roots. That Host
executes only Runs started by the granting member.

### Computers

A Computer is the place where a Run's tools execute. The contract covers:

- lifecycle: provision or reconnect, stop and destroy;
- execution: executable, argv and cwd, a stream of process events, and cancellation;
- files: bounded list, read and write inside the workspace;
- workspace: export, import and snapshot of the persistent home.

The Agent runtime stays outside the Computer. Pi runs in the daemon or the server
runtime and calls the Computer through its tools. Model credentials, account
sessions and Host credentials never enter a Computer.

Three providers implement the contract:

| Provider | Runs on                                  | Boundary                                                    |
| -------- | ---------------------------------------- | ----------------------------------------------------------- |
| `host`   | The registered device                    | Root grants only. Commands keep the user's OS permissions.  |
| `docker` | A local or server Docker Engine          | The container. Only granted paths are mounted.              |
| hosted   | One hosted sandbox service, behind a key | The provider's sandbox. Content is sent only when imported. |

The `host` provider is today's behavior. The current file and command tools move
behind the contract without changing what they permit.

The contract and the providers stay in the CLI's private harness and
`@raypx/providers`. The server runtime is the same CLI runtime, so it is not a
second consumer. Vendor SDKs load only when their provider is configured.

Rules for every provider:

- A Space has one sandbox Computer by default. Its home persists across stop,
  restart and replacement of the container or sandbox. It starts when a Run first
  needs it and stops when idle.
- A Run's target is the Space, the Computer and the project. It is immutable. A
  Run never falls back from a sandbox to the host, or from one Computer to another.
  An unavailable Computer is a waiting or failed state.
- Sandbox execution keeps the existing approval path. Running inside a sandbox does
  not approve a file mutation or a command.
- Lifecycle operations carry a generation. An older generation cannot write the
  home or accept commands after a replacement.
- A provider reports the limits it cannot enforce, such as egress control. Raypx
  shows that state. It never claims isolation a provider does not give.

Project content:

- The local `docker` provider bind-mounts a project only under its root grant, read-only
  or read-write as the user chooses. The Docker socket, the profile directory and
  credential stores are never mounted.
- A hosted sandbox receives project content only through an explicit import that
  the user confirms. Nothing local is uploaded automatically.

Who starts a Computer:

- For a device Space, the daemon manages local Docker and calls the hosted provider
  with a key from the local credential store.
- For a shared Space, the server runtime calls the hosted provider. Server-side
  Docker runs behind a separate supervisor service under `infra/*` that alone holds
  the Docker socket. API and Relay never mount it.

Docker is installed by the user or the operator. A missing or stopped Docker Engine
is an explicit state. Claude and Codex keep running on the host: they are separate
processes with their own sign-in.

A deterministic conformance suite with an in-memory provider covers the contract
offline. Each real provider passes the same suite. Live runs are opt-in and report
their provider and platform.

## Consequences

- A person can separate work by purpose on one device and run tools without the
  user's OS permissions.
- Shared Spaces need server ownership first. They follow the server phase of ADR
  0039 and do not ship with device Spaces.
- Local SQLite gains a Space scope on projects, sessions, memory, automations and
  roots. Existing rows join the default device Space in the schema migration.
- A project inside a hosted sandbox is a copy. Changes return to the device only
  through an explicit export.
- A shared Computer is one trust boundary. Members who share it can see each
  other's files there. Work that must stay private needs its own Space.
- A sandbox adds a Docker or provider dependency that the default `host` path does
  not have. The product must stay usable without either.

## Out of scope

Graphical desktops, a shared browser identity, screen streaming and user takeover.
Group chat, Agent delegation and messaging channels. Billing and seats. Organization
accounts, SCIM and enterprise SSO. Per-member Computers inside one shared Space.

## Rejected alternatives

- Tags or folders in place of a Space: they organize a list but do not stop a
  reference or a memory from crossing.
- Turning a device Space into a shared one in place: it would create two writable
  copies of the same Agent, which ADR 0039 rejects.
- Running the Agent runtime inside the sandbox: credentials and approvals would
  have to enter the place being isolated.
- Automatic fallback to the host when a sandbox is unavailable: the Run would act
  on different files with wider permissions than the user chose.
- Mounting the Docker socket into API: control of the socket is control of the
  Docker host.
- Starting with a hosted sandbox only: local work would need an account with a
  third party and an upload of project content.
