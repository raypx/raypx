# Local computers and sandbox acceptance

`infra/sandbox` is the private Bun supervisor for the Docker Computer provider.
Only it opens an Engine socket. API/worker processes receive its private URL and
dedicated token, never Docker credentials or a socket mount. The Agent runtime
stays in the backend. Start with [local setup](getting-started.md). For external
untrusted users, use [dedicated sandbox hosting](sandbox-hosting.md) with runsc
and an authenticated encrypted private channel.

## Engine and image

Provide a Linux Docker Engine with API v1.47+ through a Unix socket and a Docker
CLI. On macOS, Colima can supply that Engine. If testing egress inside its VM,
mount the checkout at the same absolute path:

```sh
colima start --runtime docker --mount "$PWD:w"
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
```

For a native Linux Engine, use `/var/run/docker.sock` or its explicit absolute
socket path. Do not assume the active Docker context selects the source
supervisor's socket. Windows and rootless Engine acceptance remain unverified.

Build the prepared image with verified manifest digests, without the `sha256:`
prefix in the two build arguments:

```sh
docker build -f infra/sandbox/Computer.Dockerfile \
  --build-arg BUN_IMAGE_DIGEST="$BUN_IMAGE_DIGEST" \
  --build-arg COMPUTER_BASE_DIGEST="$COMPUTER_BASE_DIGEST" \
  -t raypx/computer:prepared .
docker image inspect --format '{{.Id}}' raypx/computer:prepared
```

The bases are the pinned Bun image and `python:3.13-slim-bookworm`. Use the
returned immutable `sha256:…` image ID or a preloaded repository digest for
`SANDBOX_COMPUTER_IMAGE`; mutable tags are rejected. Provisioning never builds or
pulls an image. The computer includes Bun, Python, git, coreutils and a shell.

Graphical computers are an explicit image choice. The default target contains no
display server, window manager or browser. To prepare the optional image, add
`--target graphical` to that build command, select its immutable image ID and set
`SANDBOX_GRAPHICAL=true` on the supervisor. This supplies a local X display,
lightweight browser and terminal at 1024×768. Sessions start only on request;
stopping a session terminates its processes without deleting the home.
The display listens on a Unix socket inside that computer only. Screenshot and
input helpers run through the supervisor's existing Engine transport; no display
or remote-input port is exposed, bound to the host or shared between computers.
The existing bridge and egress policy apply to the browser as to other commands.

## Run the source supervisor

Copy `infra/sandbox/.env.example` to `infra/sandbox/.env.local`, keep it private,
and supply these settings:

| Setting                                                           | Value                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SANDBOX_LISTEN_ADDRESS`, `SANDBOX_PORT`                          | `127.0.0.1`, `4020` for a same-host backend. An explicit private IP is required.               |
| `SANDBOX_SUPERVISOR_TOKEN`                                        | Dedicated random secret of at least 32 characters; never reuse another application credential. |
| `SANDBOX_ENGINE_SOCKET`                                           | Absolute Unix socket; for Colima, the expanded path under the user's home.                     |
| `SANDBOX_STATE_DIRECTORY`                                         | Absolute private writable directory, unique to this supervisor.                                |
| `SANDBOX_COMPUTER_IMAGE`                                          | Immutable image ID/digest prepared above.                                                      |
| `SANDBOX_GRAPHICAL`                                               | `false` by default; `true` requires the optional graphical image.                              |
| `SANDBOX_NAMESPACE`                                               | Stable namespace for this environment's network/volumes.                                       |
| `SANDBOX_MEMORY_BYTES`, `SANDBOX_NANO_CPUS`, `SANDBOX_PIDS_LIMIT` | Defaults: 536870912, 1000000000 and 128.                                                       |
| `SANDBOX_DNS_RESOLVER`                                            | Public IPv4 upstream, default `1.1.1.1`.                                                       |

Environment files are literal; expand paths yourself rather than writing `$HOME`
in their values. Keep one supervisor per state directory. Generation tombstones
and immutable home snapshots live there and must survive restarts.

```sh
bun --env-file=infra/sandbox/.env.local infra/sandbox/src/main.ts
```

In the backend's protected root environment, set:

```dotenv
COMPUTER_PROVIDER=docker
SANDBOX_SUPERVISOR_URL=http://127.0.0.1:4020
SANDBOX_SUPERVISOR_TOKEN=<the same dedicated secret>
```

Restart backend processes after changing their configuration. `COMPUTERS_PER_SPACE`
and `COMPUTERS_PER_MEMBER` default to 1 and 10; stopped homes still count. Open an
Agent's computer panel and Start, or let an approved tool lazily start compute.
File browsing is bounded and never starts a stopped computer. Containers run as
UID 1000, with read-only root, bounded resources, no capabilities or host mounts,
and their own durable home. Homes survive replacement with generation fencing.

## Restricted egress

Container isolation alone does not enforce network egress. The supervisor reports
unrestricted egress until both `SANDBOX_RESTRICTED_EGRESS=true` and
`SANDBOX_HOST_RULES_APPLIED=true` are backed by installed Engine-host rules.
Setting flags is not proof of enforcement.

[Deployment's optional-computer procedure](deployment.md#optional-computers)
describes deriving the bridge from `SANDBOX_NAMESPACE`, reviewing
`infra/sandbox/egress.sh --dry-run`, applying the rules on the Linux Engine host,
then enabling the two flags. On Colima, the Engine host is the VM. Use the same
public resolver in the supervisor and `egress.sh --resolver`. Rules preserve public
IPv4 HTTPS and that DNS upstream, block private/metadata/host destinations and
alternate direct DNS, and deny IPv6 egress. Removing rules requires clearing the
reported enforcement state. Do not claim restricted networking from flags alone.

## Owned real-Engine gate

```sh
bun run test sandbox --engine-socket "$HOME/.colima/default/docker.sock"
# Explicit opt-in to temporary firewall changes inside this Engine VM:
bun run test sandbox \
  --engine-socket "$HOME/.colima/default/docker.sock" \
  --with-egress --dns-resolver 1.1.1.1 \
  --engine-host-command '["colima","ssh","--","sudo","-n"]'
```

Native Linux can omit the VM prefix and use `--with-egress` with root or
passwordless sudo. For a synced source checkout, run the normal root
`VP_GIT_HOOKS=0 bun install --frozen-lockfile` first. A workspace-filtered install
can omit the root test configuration's Vitest/TypeScript dependencies and CLI
shim; it is insufficient for this gate. The gate builds its own image, owns a temporary supervisor,
runs provider conformance, isolation and home-replacement probes, and cleans only
its labeled resources. No operator supervisor or database is needed. The egress
variant checks public controls, configured/alternate DNS, a host-service canary,
private ranges and metadata with owned DROP-counter evidence. It also checks the
host policy socket's peer-UID boundary, transfer rate, per-start and Space/day
budgets, connection limits, abuse-port denial and pre-conntrack datagram policing.
Five additional lifecycle probes verify startup-policy refusal, all four
Space/deployment running/storage admission reasons, idle stop despite reads,
lifetime stop during an active command, and SIGKILL recovery with owned orphan
container/volume reaping. Their disposable state and resources use the gate's
exact namespace and cleanup boundary. Public connectivity
failure in both probe and control is unavailable; IPv6 needs a reachable control.

The gate builds both default and graphical targets and records each image's byte
size. Headless safety acceptance uses the default image. Optional graphical
acceptance runs separately and explicitly reports unsupported/flaky Screen as
unavailable. Graphical conformance starts a session, checks a non-empty PNG's 1024×768
header, sends keyboard input and observes changed pixels, then verifies stopping
the session closes its frame iterator. Frames are pull-driven, capped at four per
second and one MiB per PNG. Fixed graphical helpers have intrinsic container-side
deadlines (three seconds, or ten seconds for start); the backend's longer HTTP
deadline does not leave input executing after it releases its control gate.

On 2026-11-14 the macOS arm64/Colima Linux arm64 gates passed 12/12 provider
cases (six live and six reference) and all nineteen safety/input/network probes under both runc and
runsc release-20261109.0. Separate runc graphical conformance passed both selected
cases (one live and one reference), including 1024×768 PNG capture, input-driven
pixel changes and stream closure after stop. Runsc passed those same two graphical
cases, with ten unrelated cases filtered in each graphical run. Waiting for the
window manager's EWMH readiness before starting the browser fixed its startup race
without relaxing container controls. The private-input probe verifies UTF-8 stdin/environment
delivery using hashes, temporary-input cleanup and no inheritance by the next
command. Inbox acceptance writes and reads one maximum-size 1 MiB attachment
through the Computer port, including post-write quota measurement.
IPv4 private/host/metadata/DNS enforcement and public HTTPS/configured DNS passed.
Network tests use an owned public-shaped fixture: 64 KiB/s with a 128 KiB burst,
512 KiB per start, 768 KiB per Space/day, 64 KiB allowance chunks and eight flows
per protocol. They require lifecycle stop/refusal reasons, live DROP counters,
and a faster independent Engine-host control; see [production defaults](sandbox-hosting.md#host-network-budgets).
IPv6 enforcement was unavailable because both host and computer lacked IPv6
reachability. These measurements establish this Engine VM only; other platforms
and packaged client behavior remain separate gates.

On the same date, a dedicated Ubuntu 26.04.1 x86_64 KVM guest (kernel
7.0.0-43, Docker 29.9.3/API 1.56, Bun 1.4.4) passed the native Linux amd64 gate
under runc 1.5.3 and runsc release-20261109.0/systrap. Each runtime passed 12/12
provider cases (six live, six reference), all 24 safety/input/network/lifecycle
groups, and separate graphical conformance 2/2 (one live, one reference; ten
filtered). IPv4 HTTPS/DNS and owned DROP-counter enforcement passed; IPv6 was
unavailable without a host route. On the untrusted runsc systemd profile, six
headless computers and a mix of three desktops plus three headless sessions both
refused the seventh start. Idle available memory was 6.67/6.50 GiB and host CPU
idle was 86.7%/86.2%, respectively. Headless create latency was 2.49–2.70 seconds;
mixed create latency was 2.45–7.59 seconds, plus 6.64–6.99 seconds for desktop
startup. These are idle-capacity observations, not saturated-load throughput.
The real service crash hook and missing-firewall-hook containment also passed.
The WireGuard host interface has no backend peer; API connection/handshake and
backend integration remain separate, unrun acceptance.

Add `--runtime runsc` to run the same gate with the registered gVisor runtime.
The default is explicit `runc`; runtime fallback is never automatic. The gate also
probes privilege escalation, mount/proc/sys controls, fork/memory/disk exhaustion
and cross-sandbox network reachability. Disk overrun must stop the computer.

Evidence goes to `.artifacts/sandbox-hosting/<runtime>/`. See
[validation details](validation-artifacts.md#owned-sandbox-real-engine-acceptance)
for prerequisites, cleanup and recorded platform limits. Default source tests
inject an Engine transport and never mutate firewall rules. A passing VM IPv4 gate
does not establish IPv6, Windows, rootless or another Engine's acceptance.

## Member devices

Device computers use a separate outbound connector and locally confirmed Space
directories. They do not use this supervisor, Docker lifecycle, home snapshots or
network isolation. An approved command retains the device user's OS permissions;
a directory grant is not sandbox isolation. See [device setup and acceptance](device-connector.md).
