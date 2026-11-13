# Computers, the supervisor and device connectors

A computer is the place where a Run's tools execute. It is durable: its home
survives a stopped, restarted or replaced container. The Agent runtime stays
outside it.

```text
Run (Pi, in the backend) -> computer tools -> Computer port -> docker | hosted | device
```

## The Computer port

A provider implements:

- **Lifecycle**: provision or reconnect, stop and destroy.
- **Execution**: executable, argv and cwd; a stream of process events; cancellation
  of one Run's work.
- **Files**: bounded list, read and write inside the workspace.
- **Home**: export, import and snapshot of the persistent home.
- **Description**: the capabilities it has and the limits it cannot enforce.

The port and its adapters live in `@raypx/providers`. A vendor SDK loads only when
its provider is configured. Graphical desktops, browser tools, screen streaming
and user takeover extend the same port in a later phase.

## Providers

| Provider | Runs on                        | Boundary                                   | Started by         |
| -------- | ------------------------------ | ------------------------------------------ | ------------------ |
| `docker` | The supervisor's Docker Engine | The container                              | Sandbox supervisor |
| hosted   | One hosted sandbox service     | The provider's sandbox                     | Backend            |
| `device` | A registered device            | Granted directories; the user's OS account | Device connector   |

One conformance suite runs against an in-memory provider and every real provider.
It covers lifecycle, execution, cancellation, bounded files and home persistence
across a replacement.

## Team and private computers

- A Space has one team computer by default. Its Agents share files and installed
  tools. Each Agent starts in its own folder; deliberately shared work goes in a
  shared folder. The folders organize work. They are not a security boundary.
- An Agent can use a private computer when its files must stay apart from the
  other Agents in the Space.
- The container is the security boundary. Work that must be isolated from other
  members needs its own Space.

## Lifecycle and leases

- A computer starts when a Run first needs it and stops when idle, so configured
  capacity does not become reserved memory.
- Every lifecycle operation carries a generation. An older generation cannot write
  the home or accept commands after a replacement.
- A Run holds an execution lease on its Agent's computer use. The lease has an
  expiry and a fence. One Agent has one driver at a time; different Agents on a
  team computer run concurrently.
- A Run's computer is fixed when the Run first starts. An unavailable computer is a
  waiting or failed state. A Run never moves to another computer by itself.

## Homes

- The home is a volume the supervisor owns, mounted into the container.
- A snapshot records a home revision. Stop commits a snapshot. A replaced
  container restores the latest one.
- A snapshot can be copied to object storage for backup and for moving a computer
  between hosts. This is optional.
- A failed restore keeps the last known-good revision and reports the failure. It
  does not start from an empty home.

## The sandbox supervisor

The supervisor is a separate service under `infra/sandbox`.

- It alone holds the Docker socket. Access to the socket is control of the Docker
  host, so the backend never mounts it.
- It listens on the private network only. The backend calls it with a dedicated
  token that is distinct from every other secret.
- It applies memory, CPU and process ceilings to each container. A malformed limit
  fails the supervisor at startup and names the setting.
- Deployment settings cap computers per member and per Space.
- With restricted egress, a container reaches the public internet but not the
  Docker host, the local network or cloud metadata addresses. This needs a host
  ruleset. Where it is not applied, the supervisor reports egress as unrestricted.
- The computer image is built from this repository and pinned by repository digest
  or immutable local Engine image ID. Mutable tags are rejected.

## Device connectors

The device connector is the bundled CLI daemon. It offers the device it runs on as
a computer.

- It opens an outbound WebSocket to the backend's `relay` role. It exposes no
  inbound listener.
- A device is registered to one account. A device grant lets one Space use selected
  directories on it. Granting asks for native confirmation on the device.
- Each command carries an immutable identifier, a payload hash and the current
  grant revision. The connector checks its local grant on every command and
  journals what it accepts. A retry uses the same identifier.
- Connector events carry an increasing sequence. Reconnect resumes from the
  acknowledged cursor.
- Revoking a grant, signing out or resetting the password ends access and cancels
  the work in flight. An in-flight effect with an unknown result is marked
  uncertain.
- A device runs only Runs started by the member who granted it, and never Runs
  started by a routine trigger from outside or by another member's message.
- An offline device is a waiting state.

Commands on a device keep the user's OS permissions. The grant limits scope; it is
not sandbox isolation. The product says so where the grant is given.

## Secrets in a computer

- Model credentials, sessions and connector tokens never enter a computer.
- A command that needs a secret receives it for that command only, through the
  process environment or standard input. It is not written to the home.
- Output that returns to the model is bounded. A known secret value in output is
  redacted before it reaches the conversation.

## Initial Computer slice

`@raypx/core/computers` owns the records; `@raypx/computers/server` owns the
Space-scoped lifecycle service and `/server/postgres` its persistence. Provider
records use the neutral `sandbox` key; deployment chooses the concrete adapter.
The private scope is constrained by a same-Space Agent foreign key but has no
writer yet. A team computer has no Agent owner. Foreign keys restrict deletion
of a computer's owners until a later resumable deletion workflow releases it;
there is no cascade that can silently orphan a running computer.

`computers.get/start/stop` resolve current membership, and mutations require a
trusted Origin. Reads allocate nothing; the first explicit start creates the one
team record. With `COMPUTER_PROVIDER=none`, all three return `not-configured` and
allocate nothing. The in-memory provider can be injected into server compositions
without a sandbox; it runs a documented virtual command set and never executes on
the backend host. No Run or model receives this port in this slice.

A lifecycle claim has a five-minute expiry and an increasing fence. Completion
compares Space, computer, generation, owner, fence and expiry. Start after a stop
or failed operation advances the provider generation; repeated start while running
is idempotent. Stop cannot take over an unfinished start. These are lifecycle
leases, not the later per-Agent execution leases. The database commits each
transition with a `computer.state` event in every existing Conversation in the
Space, using the existing locked counters and content-free PostgreSQL notices.
Quotas count retained computer records created by a member across their Spaces;
there is still only one team computer per Space. Private allocation, Run leases
and automatic idle shutdown will arrive with their consumers.

The supervisor runs as one instance per private state volume. It persists
fences before replacement I/O and retains generation tombstones after destroy.
Destroy removes compute and its working volume, retaining the committed home;
only a greater generation can provision it again. Revision files are bounded
version-1 JSON archives, addressed by SHA-256 over the normalized archive.
Snapshots cancel and drain known command process groups before exporting the
whole home. Stop commits a snapshot. Restores use a fresh home volume and candidate
container, verify the exported revision, then switch; failure retains the previous
revision and never substitutes an empty home. Snapshots are local to the
supervisor state volume; off-host backup and retention cleanup are not implemented.

Paths for file calls and cwd are relative to `/home/computer/workspace`.
File helpers walk directory descriptors with `O_NOFOLLOW`; traversal, absolute
paths and link components are refused. List responses contain at most 1,000
entries and a truncation flag. Reads and writes cap each file at 32 MiB.
The member procedures `computers.listDirectory` and `computers.readFile` resolve
fresh Space membership on every request and share the read quota of 60 requests
per account/procedure per minute. They never provision or restart compute.
An unconfigured provider returns `not-configured`; a missing, stopped or
transitioning computer returns `not-running` with its nullable observed state.
An unavailable provider returns `unavailable` with `COMPUTER_UNAVAILABLE`;
a provider without member previews returns `FILES_UNAVAILABLE`.

Directory previews default to 100 entries and cap at 200, with a `truncated`
flag. File previews return base64 `bytes`, the observed total `size`,
`truncated` and detected `contentType` (`text` or `binary`); the default and
maximum byte budget is 64 KiB. Text detection checks UTF-8 and disallows binary
control bytes, while tolerating a partial final code point in a truncated prefix.
The in-memory provider reads a prefix directly. The Docker adapter uses the
existing private execution transport to run a fixed isolated Python reader
inside the prepared computer image, with no shell, a five-second deadline,
bounded output and no-follow directory descriptors. This needs no supervisor
protocol change. A size is an observation, not a snapshot of a concurrently
changing file. There are no member file write or delete procedures.
Home archives include regular files, directories, permissions and link entries
without following links; special or unreadable files fail the snapshot. An archive
has at most 10,000 entries, 32 MiB of file bytes and 64 MiB of encoded JSON.
Execution streams base64 stdout/stderr with one combined budget of at most 1 MiB
and one exit event. Command environments belong only to that command. Cancellation
kills its process group; detached processes that deliberately escape that group
are not individually contained, and container stop/destroy is the final boundary.
There is no home disk quota in this slice. Provider descriptions report these
limits and never claim network restriction without the host-rules assertion.

The supervisor uses Engine HTTP API v1.47 directly through Bun's Unix-socket
fetch; no vendor SDK or backend socket configuration is needed. Provision only
uses a prepared digest-pinned image, without pulling or building it. The computer
bridge name is `rpx` plus the first ten hexadecimal SHA-256 characters of
`SANDBOX_NAMESPACE`. The deployment guide describes the private listener,
dedicated token, host-rules assertion and opt-in acceptance commands.

The host ruleset is [`infra/sandbox/egress.sh`](../../infra/sandbox/egress.sh).
On the Linux Engine host, pass its deterministic bridge with `--bridge` and use
`--dry-run`, `--apply` or `--remove`. Apply/remove are scoped and idempotent. The
script requires Docker's iptables backend, `iptables`, `ip6tables` and root; apply
also verifies the bridge exists in the current host namespace. It blocks computer
traffic to the host and private/reserved IPv4 destinations before and after DNAT.
Public IPv4 follows Docker's policy; all computer IPv6 egress is denied. Set both
egress assertions only after applying and verifying the rules on that Engine host.
Native nftables Docker networking and rootless/remote network namespaces are not
supported by this script. macOS/Colima requires rules inside the Linux Engine VM.

`bun run raypx-dev test sandbox` owns real-Engine conformance, isolation and home
replacement acceptance, with optional `--with-egress` host probes. Ordinary source
verification uses fakes and never invokes Docker. The only recorded real-Engine
acceptance is manual provider conformance on macOS arm64 / Docker Engine 29.5
through Colima (`77a9421c`, 10/10). The new gate, Ubuntu/Linux amd64 or arm64,
macOS x64/other Engine configurations, Windows, rootless engines and restricted
egress have no recorded real-Engine acceptance. CI wiring is not a passing run.
