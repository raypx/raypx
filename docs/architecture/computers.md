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
its provider is configured. Optional graphical operations extend this same port;
capability checks make an image without a graphical stack explicit.

## Providers

| Provider | Runs on                        | Boundary                                   | Started by         |
| -------- | ------------------------------ | ------------------------------------------ | ------------------ |
| `docker` | The supervisor's Docker Engine | The container                              | Sandbox supervisor |
| hosted   | One hosted sandbox service     | The provider's sandbox                     | Backend            |
| `device` | A registered device            | Granted directories; the user's OS account | Device connector   |

One conformance suite runs against an in-memory provider and every real provider.
It covers lifecycle, execution, cancellation, bounded files and home persistence
across a replacement. Graphical-capable providers additionally start a session,
capture its bounded PNG, change the screen through input and close a frame stream
when the session stops.

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

Child Runs share their Agent's driver gate with the parent and all its other
conversations. PostgreSQL serializes acquisition on the Agent row and validates
the current Run lease/fence. Computer calls queue at this gate; concurrent model
turns, pending approvals and delegation-result waits hold no driver slot.
Different Agents can use a team computer concurrently. An expired or cancelled
attempt cannot release a newer attempt's slot.

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

## Untrusted tenant hosting

The first production path is a dedicated self-hosted supervisor, with `runsc`
selected explicitly and `SANDBOX_UNTRUSTED_TENANTS=true`. Startup validates runtime
registration and refuses the default runtime without an explicit diagnostic
override. A WireGuard private channel authenticates and encrypts backend-to-host
traffic. The supervisor receives no database/model credentials. See the
[deployment artifacts and operating procedure](../development/sandbox-hosting.md).

Supervisor metadata binds each computer to an immutable Space identity received
from trusted backend provisioning. Serialized admission caps running computers and
reserved home storage per Space/deployment, including stopped homes. Read-only
trusted meter containers inspect paused writable volumes outside tenant namespaces;
exceeding bytes/entries or failing measurement stops compute. Idle and maximum
lifetime limits persist across supervisor crashes. Orphan cleanup uses exact owned
labels and the durable inventory. Backend lifecycle observations update PostgreSQL
under generation/lease fences and emit the existing state events; they never
provision during reads. Additive lifecycle availability reasons explain quota refusals.
These controls are local to one supervisor; fleet quotas are not implemented.

Untrusted mode also requires host-side network budgets. A separate root service
admits only the supervisor UID over a private Unix socket; it holds no Docker or
backend credentials. Durable reservations precede kernel packet allowances. Defaults
are 1 MiB/s aggregate forwarded transfer, 1 GiB per start, 10 GiB per Space/UTC day,
64 MiB reservation chunks and 64 tracked flows per protocol. Host pre-conntrack
rules bound SYN/datagram floods; the filter policy permits public TCP 80/443 and
the selected DNS resolver only. Exhaustion stops compute and returns translated
lifecycle reasons, including subsequent reads of stopped computers. Packet policing,
conservative reservations and control/provider-ingress exclusions are detailed in
the [hosting guide](../development/sandbox-hosting.md#host-network-budgets).

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

Protected input now implements single-operation sandbox command environments with
encrypted addressed requests and exact output scrubbing. Device journal payloads,
file writes and graphical input do not accept it. See
[protected input](protected-input.md) for recovery and disclosure limits.

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
there is still only one team computer per Space. Private allocation remains constrained; supervisor idle shutdown is now implemented.

The supervisor runs as one instance per private state volume. It persists
fences before replacement I/O and retains generation tombstones after destroy.
Destroy removes compute and its working volume, retaining the committed home;
only a greater generation can provision it again. Revision files are bounded
version-1 JSON archives, addressed by SHA-256 over the normalized archive.
Snapshots cancel and drain known command process groups before exporting the
whole home. Stop commits a snapshot. Restores use a fresh home volume and candidate
container, verify the exported revision, then switch; failure retains the previous
revision and never substitutes an empty home. Snapshots are local to the
supervisor state volume; obsolete revisions are pruned after the current one commits.
Off-host backup remains an operator procedure.

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
Writable volumes now have measured byte/entry enforcement and stop-on-exceed;
this is not a hard filesystem quota. Provider descriptions report these
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
Public IPv4 is restricted to TCP 80/443 and configured DNS; all computer IPv6 egress is denied. Set both
egress assertions only after applying and verifying the rules on that Engine host.
`SANDBOX_DNS_RESOLVER` selects one public IPv4 upstream (default `1.1.1.1`);
pass that same address as `egress.sh --resolver ADDRESS`. Computers use the
Engine's embedded `127.0.0.11` resolver with that sole upstream under runc.
For runsc, an owned root-owned read-only volume subpath pins the configured public
resolver at `/etc/resolv.conf`, because the stable netstack cannot reach Docker's
loopback DNS service. No host bind or host network mode is used. Direct UDP/TCP
port 53 is blocked to every other destination, including original destinations
before DNAT. Changing the resolver requires removing the previous owned rules
before applying the new configuration. Public HTTPS remains available and can
carry encrypted DNS or other tunnels; this policy does not inspect HTTPS content.
Native nftables Docker networking and rootless/remote network namespaces are not
supported by this script. macOS/Colima requires rules inside the Linux Engine VM.

`bun run raypx-dev test sandbox` owns real-Engine conformance, isolation and home
replacement acceptance, with optional `--with-egress` host probes. Ordinary source
verification uses fakes and never invokes Docker. On 2026-11-14 the gate passed
on macOS arm64 with a Linux arm64 Engine VM (29.5.2, API 1.54) under runc and
runsc release-20261109.0: provider conformance 12/12 (six live, six reference)
and nineteen safety/input/network probes per runtime, including protected stdin/environment,
inbox delivery, host cost controls and IPv4 egress enforcement. Separate graphical
conformance passed under both runtimes: one live case and one reference case each,
covering capture, input-driven pixel changes and stream closure. Waiting for EWMH
readiness before launching the browser fixed the runsc startup race under the same
container limits. IPv6 enforcement was unavailable because
the VM has no usable IPv6 route. A dedicated Ubuntu 26.04.1 amd64 KVM guest also passed on 2026-11-14
(kernel 7.0.0-43, Engine 29.9.3/API 1.56): runc 1.5.3 and runsc
release-20261109.0/systrap each passed 12/12 provider cases, 24 safety/input/network/
lifecycle groups and separate graphical conformance 2/2. IPv6 remained unavailable
without a route. Its untrusted systemd profile admitted six headless computers and
three desktops plus three headless sessions, refusing the seventh start; crash-hook
and firewall-loss containment passed. The host stays disconnected, with no backend
WireGuard peer. See the hosting guide for the six-headless/three-graphical sizing
profile and limits of the idle-capacity observations. Other distributions/Engine
configurations, packaged clients, Windows and rootless engines remain unverified.
CI wiring is not a passing run.

The `--with-egress` case now probes a started computer and compares its public
HTTPS and configured UDP/TCP DNS results with controls in the Engine host network.
It checks the runtime’s resolver file and configured upstream, alternate public
resolvers, metadata `169.254.169.254`, host loopback, an owned host-service canary, the
computer bridge gateway and one destination in each RFC 1918 range. Private and
alternate-DNS probes must time out and increment the owned firewall DROP counters;
a missing listener or an offline runner alone cannot satisfy those assertions.
Loopback is compared with the known-open canary listener on the Engine host.
`--engine-host-command` accepts an explicit JSON argv prefix for root firewall
commands inside a VM; the checkout must be mounted at the same absolute path.
The gate reads and mutates only the rules for its generated bridge.

An allowed public HTTPS request passes only after a verified TLS connection and
successful HTTP response. When both the host control and computer fail for reported
network reasons, public reachability is explicitly `unavailable`, never passed.
TLS, HTTP, malformed DNS and probe errors fail the gate. A failed computer request
with a successful host control also fails. Configured DNS availability is reported
separately when the runner is offline. Source fakes cover these decisions, resolver
configuration and cleanup. IPv6 enforcement needs a reachable Engine-host
control and an increasing owned DROP counter; an unreachable host control is
reported as unavailable, even if the IPv6 rules were installed.

A valid embedded-DNS SERVFAIL counts as unavailable only when the corresponding
host UDP/TCP upstream control independently fails for a network reason. Direct
upstream SERVFAIL and malformed replies still fail; a working public HTTPS path
with unavailable configured DNS also fails.

## Graphical screen and member takeover

The optional graphical computer image provides a local-only X session and a
browser. The ordinary computer image remains the default. The supervisor reaches
its fixed helpers over private Engine execution; the computer publishes no screen
or input listener. Provider methods `screen`, `startScreen`, `stopScreen`,
`screenshot`, `input` and `streamScreen` are optional capabilities. The memory
provider supplies a deterministic 1024×768 PNG surface and never opens host apps.
Neither browser software nor a graphical session changes the existing container
or egress boundaries.

`ComputerScreensService` separates screen viewing and takeover from computer
lifecycle. Reads never provision compute. A member explicitly starts the graphical
session on a running computer. The API resolves the session and fresh Space
membership for commands and subscribes the same member to a bounded screen stream;
it never returns a supervisor address or provider credential. Stream state is
refreshed at least once per five seconds so another viewer observes the control
holder even when the screen is static. Departure closes with
`SPACE_MEMBER_REMOVED` or `SPACE_MEMBER_LEFT`; a deleting Space and an expired
session have their own reasons. Frames cap at one MiB and four per second. An
inactive provider closes after ten seconds; a view stream expires after five
minutes and a client can explicitly reconnect.

One PostgreSQL control grant per Space/computer records an unpredictable grant ID,
computer generation, member, display name, viewer identity and a thirty-second
expiry. A PostgreSQL viewer registration has a ten-second heartbeat expiry;
acquisition and renewal require that live viewer. Disconnect deletes it under the
same control lock, so a delayed acquire cannot resurrect a closed view. Only the
grant’s member can renew it or submit input; a current Space owner can
force release it. Other members can still view. Disconnect releases only the
bound account/viewer/generation, so closing a second viewer cannot release the
controller. Membership removal releases the grant inside its Space transaction.
The stream also registers its viewer in PostgreSQL with a ten-second heartbeat
expiry. Acquisition, renewal and input require that live registration. Closing
deletes it under the same lock as release; a delayed acquire cannot recreate a
grant after disconnect, and a delayed heartbeat never recreates a viewer.
Viewing and viewer heartbeats do not wait for the input gate held by Agent work.
An expired grant never authorizes input. If that gate is busy, a view reports no
control holder immediately and defers the existing transactional audit cleanup
until the holder completes or the next grant admission.
Expiry is enforced by every admission, independently of client clocks. Stop,
replacement, explicit release, forced release and disconnect also end the grant.

Control acquisition and all pointer/keyboard input use the same PostgreSQL
transaction advisory lock. Acquisition waits for an already admitted Agent input
to finish; subsequent Agent input waits for release or expiry. Provider input has
an intrinsic execution deadline, and the lock stays held until the operation
settles. Screenshots remain available during takeover. The Run records its input
pause so clients show the actual wait rather than simulated progress. Starting
and ending every takeover appends Space audit intent/outcome evidence in the
same transaction as the grant change; missing audit storage refuses the change.
Frames and typed input are never part of logs or grant rows.

Web and Desktop share the Screen capability surface. Mobile does not yet provide
screen viewing or takeover; its computer lifecycle and approval UI remain
available. Browser and source tests establish their own layers; packaged desktop,
mobile-device and real-Engine results remain independent acceptance gates.

## Implemented device Computers

Member-owned device computers now use the separate `raypx device` connector. The
member selects a locally confirmed Space directory per conversation for subsequent
Runs. One grant has a same-Space `computers` row with `scope/provider=device`; it
does not consume a team-sandbox quota or expose sandbox lifecycle controls.
`device_computers`, `device_computer_pairings`, `device_space_devices`,
`device_directory_grants`, `device_computer_selections`, `device_connector_operations`
and `device_connector_events` hold registration, consent, selection and receipts.
Composite keys bind grant/member/device/Space and operation/Run/conversation.

The Computer adapter runs no backend-host I/O. Its injected registry routes locally
or over the existing private broker. Every admission revalidates the live Run lease
and fence, current membership, device/grant revisions, parent root requester and
steering provenance. Another member or another routine owner receives no authority.
Native pairing and every directory grant use one-use local confirmations. The
connector checks no-follow paths and root inode identity as well as server scopes.
Revoked selections stay unavailable; a Run never silently switches computers.

Device commands always need an addressed approval or the documented exact Allow,
including in Never ask. Auto never approves them. The connector journal and server
effect records preserve uncertainty after disconnect; unknown effects never replay.
Device homes and Screen are unsupported, and command OS permissions are not
sandbox isolation. See [setup, protocol bounds, decisions and platform limits](../development/device-connector.md).

Protected command input supports environment and UTF-8 stdin on sandbox and
member-owned device computers. Connector protocol 2 keeps values outside operation
hashes and journals, and scrubs output before the device outbox. File and screen
input remain unavailable. See [protected input](protected-input.md) for the exact
boundary, encoding limits and independent acceptance layers.

The Files read port also accepts a device/grant selector for its owning member.
Expiring connector member-read frames provide bounded read-only browsing without
Runs or commands. Attachment writes use generated inbox paths and the existing
Computer execution gate. See [device Files](member-input-and-notifications.md#device-files).
