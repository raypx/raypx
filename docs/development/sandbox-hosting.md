# Hosting computers for untrusted tenants

The first production path is a self-hosted supervisor on a dedicated Linux host.
The API and workers remain on another host. Only the supervisor holds the Docker
socket. It receives no database, model, mail, session or application encryption
credentials. A computer receives neither the socket nor supervisor credentials.
Use the [local gate](sandbox.md) before admitting external users; source tests do
not establish host isolation.

## Topology and private channel

```text
API / workers -> WireGuard peer -> private supervisor -> Docker -> runsc computers
PostgreSQL stays with the backend; homes and supervisor state stay on the compute host.
```

WireGuard authenticates both hosts and encrypts the entire control channel,
including streaming command output and frames. Its session keys rotate through
its protocol. Each host has its own long-term private key; never reuse an API or
supervisor token as a transport key. The independent bearer token still authenticates
application requests. HTTP is permitted only inside this authenticated tunnel.
A private LAN address by itself does not provide encryption or peer authentication.

Templates live in [`deploy/sandbox-host`](../../deploy/sandbox-host/). Install
WireGuard with the host distribution's maintained packages. Generate each key on
its own host with `wg genkey` under `umask 077`; exchange public keys only. Install
the two templates as `/etc/wireguard/raypx-control.conf` (`0600`), replacing keys
and the endpoint. Their AllowedIPs are exact peer /32s, with no default route or
routing between tenants and the backend. Enable `wg-quick@raypx-control` on both
hosts. To stage a standalone host before backend approval, install only the host
`[Interface]` with a locally generated private key and no `[Peer]` section. The
private address lets the supervisor start; no peer can reach it and the public
WireGuard port remains blocked. Add the exact backend peer and firewall allowance
only during the later approved connection procedure. Do not publish supervisor port 4020 or Docker's API.

Set only these computer settings on API and worker:

```dotenv
COMPUTER_PROVIDER=docker
SANDBOX_SUPERVISOR_URL=http://10.77.0.2:4020
SANDBOX_SUPERVISOR_TOKEN=<independent random secret, at least 32 characters>
```

If API/worker run in containers, route that single destination through their host's
WireGuard interface and restrict forwarding to their backend network. Do not join
the tenant bridge. Verify the real container-to-supervisor route, peer identity,
failed authentication and rejected public/LAN access before enabling Computers.
The existing Compose `sandbox` profile is for same-host development; leave that
profile disabled in this topology. Backend containers mount no Docker socket.

Rotate bearer tokens and long-term WireGuard keys at least monthly and after any
suspected exposure. Drain new Computer starts, stop the supervisor listener, replace
the dedicated token on both sides and restart backend processes and supervisor.
For WireGuard, generate new keys locally, exchange only public keys, update both
peer configurations in a maintenance window and use `wg syncconf` with protected
configuration input. Confirm a new handshake and that the old key cannot connect.
Never print `wg showconf`, decrypted environments or private keys into evidence.
Session key rotation does not replace revocation of long-term keys. This procedure
allows a brief control-plane outage; unknown command effects must not be replayed.

## Internet-exposed host baseline

Prepare a fresh dedicated host before installing the supervisor. Apply distribution
security updates and reboot if required, then verify the running kernel. Enable
unattended security updates and their timers; minimal images may mask these units.
Keep automatic reboot disabled: runtime/firewall upgrades require draining and
new acceptance. Keep Docker/containerd upgrades in that maintenance procedure.
Verify synchronized UTC with the distribution's maintained time service.

Keep an administration session open and prove key login in a second concurrent
session before disabling password and keyboard-interactive authentication. Retain
`PermitRootLogin prohibit-password` when root is the only authorized account;
require public-key authentication, disable agent/X11 forwarding and limit failed
authentication/startups. Validate with `sshd -t`, reload and prove a fresh login.
Install fail2ban with the systemd SSH journal backend or equivalent rate limiting.
When using a host INPUT policy chain, set the SSH jail's `chain` to that chain
(e.g. `RPX_HOST_INPUT`), so a new ban never inserts a jump ahead of the mandatory
tenant hook. Verify a disposable documentation-address ban/unban and rule priority.
Never copy operator private keys onto this host.

Use a boot-persistent IPv4 **and** IPv6 INPUT default-deny firewall. Permit
loopback, established/related replies, administration SSH and necessary bounded
ICMP; reject invalid traffic. Allow the WireGuard UDP port only from the selected
backend address after its peer is approved. With no peer, leave that port blocked.
Docker forwarding is separate: preserve its iptables backend and the owned tenant
rules. Never restore a full stale ruleset over Docker or flush unrelated chains.
The template inserts its exact WireGuard control allow before its TCP 4020 deny;
place the general host INPUT policy after these owned hooks. No public supervisor
or Engine listener is permitted. Check persistence after reboot.

Load `br_netfilter`; enable IPv4 forwarding and bridge IPv4/IPv6 filtering for
Docker. Disable IP source routing, ICMP redirects (including IPv4 send redirects),
and IPv6 redirects. Use loose IPv4 reverse-path filtering (`rp_filter=2`) with
bridges/WireGuard, TCP SYN cookies, restricted kernel pointers/dmesg, and protected
symlinks/hardlinks/FIFOs/regular files. Preserve namespace/cgroup support needed by
Docker and runsc; do not disable unprivileged namespaces indiscriminately.
For systrap, retain `kernel.yama.ptrace_scope=1`: the stricter value `2` prevents
its unprivileged Sentry from tracing its own child processes and aborts startup.
Do not compensate with container capabilities, unconfined policy or host networking;
keep OCI seccomp enabled and rerun privilege/kernel escape acceptance.
Record effective settings rather than claiming that a sysctl file alone applied.

Install Docker Engine from its official distribution repository with a dedicated
`signed-by` keyring. Validate and preserve daemon settings. On a fresh host use
`userland-proxy=false`, `live-restore=true`, `icc=false`, bounded local logs
(`max-size=10m`, `max-file=3`), and `no-new-privileges=true`. Tenant logs remain
explicitly disabled by the supervisor. Default bridge ICC and each owned bridge's
ICC setting are independent. Bound host journal retention and monitor disk/inodes,
conntrack and owned rule presence. Drain and revalidate after daemon upgrades.

## Runtime and host installation

Use a maintained Linux kernel, Docker Engine API v1.47+, cgroup memory/CPU/PID
controllers, Docker's iptables backend, and the pinned Bun 1.4.4 runtime. Rootless
and Docker's native nftables backend are not accepted by this firewall integration.
No other workload or operator data belongs on the compute host.

Install gVisor from the signed distribution repository or the checksummed release
archive described in the [official installation guide](https://gvisor.dev/docs/user_guide/install/).
Pin and record the selected release and architecture. For a drained dedicated
host with `curl`, `bzip2`, `tar` and `sha512sum` installed, the recorded release can
be prepared explicitly (review the checksum through your release process):

```sh
RAYPX_RUNSC_RELEASE=20261109.0
RAYPX_RUNSC_ARCH="$(uname -m)"
RAYPX_RUNSC_STAGE="$(mktemp -d /tmp/raypx-runsc-install.XXXXXX)"
cd "$RAYPX_RUNSC_STAGE"
RAYPX_RUNSC_URL="https://storage.googleapis.com/gvisor/releases/release/$RAYPX_RUNSC_RELEASE/$RAYPX_RUNSC_ARCH"
curl -fLsS -O "$RAYPX_RUNSC_URL/gvisor.tar.bz2"
curl -fLsS -O "$RAYPX_RUNSC_URL/gvisor.tar.bz2.sha512"
sha512sum -c gvisor.tar.bz2.sha512
sudo tar -xjf gvisor.tar.bz2 -C /usr/local/bin runsc gvisor-bin
/usr/local/bin/runsc --version
```

Keep the checksum/version in protected release evidence; remove only this staging
directory after installation. Current archives include
`runsc` and its adjacent `gvisor-bin/` helpers; install them together in a location
readable/executable by all runtime users. Do not rely on the old single-binary
installer. Back up `/etc/docker/daemon.json`, preserve every unrelated setting and
add a named runtime, without changing the daemon's default:

```json
{
  "runtimes": {
    "runsc": {
      "path": "/usr/local/bin/runsc",
      "runtimeArgs": [
        "--platform=systrap",
        "--network=sandbox",
        "--directfs=false",
        "--oci-seccomp=true"
      ]
    }
  }
}
```

`systrap` supports hosts without nested KVM. Evaluate KVM separately on dedicated
bare metal and rerun acceptance. Keep gVisor's user-space network stack:
`--network=host` bypasses this design. Do not enable runtime flag overrides, shared
rootfs access, host devices or debugging of tenant content. See the
[gVisor network model](https://gvisor.dev/docs/user_guide/networking/).
For runsc, the supervisor pins `/etc/resolv.conf` to a root-owned, read-only file
in its owned helper-input volume, using Engine volume subpaths. A stopped setup
container populates it without starting tenant code. Docker's embedded loopback
resolver is not reachable through the stable gVisor netstack; direct public DNS
keeps sandbox networking and the existing bridge firewall. No host bind mount,
host network mode, experimental proxy, or runtime fallback is needed. The file's
root ownership prevents modification through the writable volume alias; replacing
its directory entry cannot change the inode mounted read-only at `/etc/resolv.conf`.

The supervisor rejects known unsafe runtime arguments but cannot attest the
binary behind an operator-chosen runtime name. Untrusted runsc startup also requires `--oci-seccomp=true` so Docker’s guest
seccomp policy applies, including restrictions on introspection of trusted helpers.
gVisor supplies its own host syscall
filters; OCI seccomp/AppArmor support differs from runc. gVisor exposes a virtual PID
cgroup with `max`; the application PID budget also uses RLIMIT_NPROC. Acceptance
checks the Engine host ceiling and proves guest fork refusal instead of treating
the virtual cgroup file as evidence of the host limit. The fixed helper applies
trusted hard file/PID rlimits from fixed numeric arguments outside guest-writable
input data before dispatch, including GUI helpers, because OCI exec may not
inherit the init process limits. Isolated Python mode disables tenant-owned
interpreter startup hooks and module search paths; GUI code loads from its fixed
read-only image path. A ready prefix prevents an early
OCI startup response from being mistaken for command output. No container requests
unconfined security options. Verify the selected runtime's actual security model.

Validate Docker's configuration, then reload it with SIGHUP or the distribution's
reload action. On a shared test daemon, never restart it to activate a runtime;
report that acceptance unavailable if live reload is unsupported. Confirm
`docker info` lists the exact runtime and a labeled, disposable container can
execute. Runtime installation is a separate operator action; provisioning never
pulls images, installs runtimes or falls back to runc.

Build the supervisor with `bun run --cwd infra/sandbox build`. Install its
`dist/server.mjs`, `infra/sandbox/egress.sh`, `infra/sandbox/host-network.py`, and the host template's
`prepare-host.sh`, `stop-owned.sh` and `check-host.sh` into an immutable `/opt/raypx-sandbox/releases/<release>/`, owned
by root. Create `/opt/raypx-sandbox`, its `releases` parent and the release directory
explicitly with mode `0755`; a root `umask 077` otherwise creates inaccessible
parents. The bundle needs mode `0644` and scripts `0755`. Verify
`runuser -u raypx-sandbox -- test -r /opt/raypx-sandbox/current/server.mjs`
after creating the service account. Keep credentials/state private independently.
Point `/opt/raypx-sandbox/current` at that release. Prepare the digest-pinned
Computer image from the same release using [the image procedure](sandbox.md#engine-and-image). Preload it
onto this Engine and record its immutable image ID or repository digest.

Create a `raypx-sandbox` system user/group with Docker socket access. This access
is effectively root on the dedicated compute host. Install the supervisor/network systemd units plus the check service/timer and
copy `supervisor.env.example` to `/etc/raypx-sandbox/supervisor.env` (`0600`, root).
Fill in the independent token and image digest. The unit grants only its private
state directory for writes and bounds supervisor memory/tasks. Never populate it
from the backend's full environment file.

The production template sets `SANDBOX_UNTRUSTED_TENANTS=true` and
`SANDBOX_RUNTIME=runsc`. Startup checks Engine runtime registration, seccomp,
memory, CPU and PID support before opening a listener. Untrusted mode refuses the
Engine default and runc runtime names unless `SANDBOX_ALLOW_DEFAULT_RUNTIME=true`
is explicitly set. That override weakens isolation and is for controlled diagnosis;
it does not turn a runc acceptance result into gVisor acceptance. Untrusted mode
also requires both restricted-egress assertions. These are operator assertions,
not a firewall attestation.

## Firewall and boot order

Allow WireGuard UDP 51820 only from the backend host, administration only from
the operator network, and no public TCP listeners. The supplied `prepare-host.sh`
creates the namespace's labeled bridge if absent, installs the private control
allow/deny rules, then applies tenant egress hooks last so they retain first-rule
priority across service restarts. It restricts TCP 4020 to the exact WireGuard interface and peer. It never flushes
unrelated rules. Adapt its fixed /32s together with both WireGuard templates if
choosing another subnet. Allow outbound public HTTPS and the selected public DNS
resolver; do not expose Docker on TCP.

`egress.sh` drops tenant traffic to the host, private/reserved/metadata IPv4
addresses before and after DNAT, and alternate direct UDP/TCP DNS. All IPv6
egress is denied. Docker's bridge has inter-container communication disabled.
gVisor netstack writes packets through that bridge's network namespace, so the
same host forwarding policy remains necessary. Acceptance must prove both peer
isolation and increasing owned DROP counters under each runtime.

The unit orders WireGuard and Docker before preparing rules and opening the
supervisor. Its privileged `ExecStopPost` hook stops only exact-label owned tenant
containers on service exit/crash, without removing homes. A failed maintenance
sweep closes the listener and exits with failure; systemd contains compute and
restarts the supervisor. Test that hook on the actual dedicated host. After a reboot or any firewall/Docker upgrade, keep admission closed
until rules and counters are verified. An independent firewall reset while running
can remove enforcement; flags do not detect this. Enable `raypx-sandbox-check.timer`: every fifteen seconds its independent root
check contains owned tenants and stops admission if an owned IPv4/IPv6 host or
forwarding hook disappears, disk use reaches 85%, or inode use reaches 90%.
A refusal stays stopped until operator repair and explicit restart. The network
accounting monitor additionally refuses missing owned cost hooks while running.
Inspect failures in the check service's journal; a timer without external alert
collection is local containment only. A root attacker can disable these services. Never switch
to gVisor host networking to fix a failed network probe.

## Host network budgets

Install immutable `infra/sandbox/host-network.py` beside `server.mjs` and the network/supervisor
systemd units from the host templates. Linux needs Python 3 and iptables with
time/quota/hashlimit/connlimit support. The nft compatibility frontend is supported;
Docker's native nftables backend is not. Start `raypx-sandbox-network.service`
before the supervisor. Its Unix socket admits the exact supervisor UID using peer
credentials and filesystem permissions. The service has network-administration
and raw-socket capabilities, no Docker socket, backend credentials or public
listener. Supervisor `NoNewPrivileges` stays enabled. Release files stay root-owned
and immutable to the supervisor. Never mount this socket in a computer or API.

Untrusted mode requires `SANDBOX_NETWORK_LIMITS=true`. Production uses the Unix
socket. `SANDBOX_NETWORK_HOST_COMMAND` and an absolute `SANDBOX_NETWORK_HELPER`
are an explicit validation adapter for a remote Engine VM. The local Compose
supervisor remains trusted development; network limits need a reviewed host-socket
bind override there. Do not use arbitrary command prefixes in production.

| Setting                             |     Default | Meaning                                             |
| ----------------------------------- | ----------: | --------------------------------------------------- |
| `SANDBOX_NETWORK_BYTES_PER_SECOND`  |     1048576 | 1 MiB/s aggregate upload + download per computer    |
| `SANDBOX_NETWORK_BURST_BYTES`       |     1048576 | one-second initial burst; at least the rate         |
| `SANDBOX_NETWORK_TRANSFER_BYTES`    |  1073741824 | 1 GiB per start                                     |
| `SANDBOX_NETWORK_SPACE_DAILY_BYTES` | 10737418240 | 10 GiB reserved transfer per Space per UTC day      |
| `SANDBOX_NETWORK_CHUNK_BYTES`       |    67108864 | 64 MiB durable allowance quantum                    |
| `SANDBOX_NETWORK_CONNECTIONS`       |          64 | tracked TCP flows and tracked UDP flows, separately |
| `SANDBOX_NETWORK_POLL_MS`           |        5000 | network accounting interval                         |

The host kernel polices both directions through one byte bucket and quota chain
per computer. This is packet policing, not smooth shaping; TCP retransmission can
lower effective throughput. Public traffic defaults to TCP 80/443 and TCP/UDP 53
to the selected resolver. SMTP, SSH, remote desktop, database ports, arbitrary UDP
and other IP protocols are denied. Extra ports require an operator-reviewed host
policy release and new acceptance. Connection limits count host conntrack
lifetimes, which can outlast an application socket. Before conntrack allocation,
raw-table rules police outgoing bytes, TCP SYNs (16/s, burst 32), and UDP datagrams
(64/s, burst 64), and drop other protocols and IPv6. Rejected connection floods
therefore have a bounded arrival rate into host connection tracking as well.

Before granting a quantum, the service reserves it against start and Space/day
budgets and fsyncs its private journal. Refill freezes that computer's chain while
reading admitted-byte counters and replacing its quota. The nft frontend displays
a configured quota, not remaining credit. UTC kernel cutoffs deny old-day grants
at midnight even if a poll is late. Backwards UTC dates refuse admission. An
over-budget packet drops immediately; the supervisor then stops compute and
publishes `COMPUTER_TRANSFER_LIMIT` or `SPACE_DAILY_TRANSFER_LIMIT`. Missing host
accounting contains compute and reports capacity unavailable. Clients translate
these reasons in English and Chinese, including subsequent stopped-state reads.

Unknown/unused reservations are not refunded after crash/stop. A running computer
can hold roughly 1.5 quanta ahead of observed usage, so daily admission is
conservative even for starts with no traffic. Logs report observed/reserved bytes
and Space reservations without content. Admission/refill serialize in the host
journal. Preserve `/var/lib/raypx-sandbox-network` with supervisor state during
upgrades/backups; deleting it resets cost authority and requires drained operator
recovery. Startup removes exact owned orphan rules without refunding reservations.
Quotas belong to this supervisor/namespace; keep each Space's placement stable.
This does not provide fleet-wide billing or scheduling.

Limits count forwarded IP bytes, including headers, and exclude private Engine/
control streams with their existing output/frame bounds. Locally discarded
packets do not consume transfer credit. Inbound bytes/retransmissions may already
have reached a provider interface before host policing drops them. This cannot
guarantee provider billing or prevent unsolicited host floods. Monitor conntrack,
network saturation and provider usage independently. Root firewall changes can
remove enforcement; the monitor refuses missing owned hooks, but host incident
containment remains necessary.

## Limits and accounting

These are supervisor defaults; each setting accepts positive decimal integers.
Malformed configuration fails startup. Backend record quotas remain independent
(`COMPUTERS_PER_SPACE=1`, `COMPUTERS_PER_MEMBER=10`).

| Setting                            |    Default | Meaning                                               |
| ---------------------------------- | ---------: | ----------------------------------------------------- |
| `SANDBOX_MEMORY_BYTES`             |  536870912 | 512 MiB RAM, with swap disabled                       |
| `SANDBOX_NANO_CPUS`                | 1000000000 | one CPU                                               |
| `SANDBOX_PIDS_LIMIT`               |        128 | guest PID budget; runsc receives hard RLIMIT_NPROC    |
| `SANDBOX_RUNTIME_PIDS_OVERHEAD`    |        256 | additional Engine PID slots for runsc service tasks   |
| `SANDBOX_HOME_BYTES`               |  268435456 | 256 MiB measured writable volume budget               |
| `SANDBOX_HOME_ENTRIES`             |      10000 | bounded accounting traversal                          |
| `SANDBOX_IDLE_MS`                  |     900000 | 15 minutes without tool activity or an active command |
| `SANDBOX_MAX_LIFETIME_MS`          |   14400000 | four hours per start, including active work           |
| `SANDBOX_REAP_MS`                  |      15000 | maintenance scheduling interval                       |
| `SANDBOX_SPACE_RUNNING`            |          2 | concurrent computers in one Space                     |
| `SANDBOX_DEPLOYMENT_RUNNING`       |         16 | concurrent computers on this supervisor               |
| `SANDBOX_SPACE_STORAGE_BYTES`      | 1073741824 | 1 GiB reserved home/snapshot capacity per Space       |
| `SANDBOX_DEPLOYMENT_STORAGE_BYTES` | 8589934592 | 8 GiB reserved capacity on this supervisor            |

For runsc, the 128 guest PID budget is a hard RLIMIT_NPROC on trusted helpers and
their children. Its Sentry/gofer/systrap host tasks share a separately bounded
384-PID Engine cgroup (128 + 256 runtime slots). The fork probe must observe guest
refusal without exhausting runtime service tasks. Size host PID capacity for
`running * (guest budget + runtime overhead)`, in addition to host services.

A computer runs as UID/GID 1000, drops all capabilities, disables privilege gain,
uses private PID/IPC/cgroup/network namespaces, a read-only root, a 64 MiB tmpfs,
64 MiB shared memory and two explicitly owned writable volumes (plus the runsc read-only resolver subpath). It has no host
mount, device, Docker socket, published port or capability add-back. Open files
are bounded at 1024; each file is bounded by the home budget. Tenant container
logging is disabled; only bounded command output enters its existing private
stream. Meter logging is also disabled; its bounded numeric result uses private Engine execution.

Engine local named volumes have no portable size option. On supported storage,
operators should additionally apply filesystem/project quotas to their dedicated
volume pool. The portable fallback pauses the computer, mounts its home and
helper-input volumes read-only into a fresh trusted image with no network, and
counts the greater of apparent/allocated bytes plus entries. It follows no links,
bounds traversal and times out. A tenant cannot replace the measuring program or
hide descendants in another PID namespace. A cumulative cgroup write budget of `H` per start also bounds open-but-unlinked
files that directory traversal cannot see. A fixed fsync probe verifies write
accounting before admission; unsupported accounting refuses compute. Rewriting
the same file consumes this conservative write budget even when its live size
stays small. A breach or measurement failure stops
the computer. This is measured enforcement, not a hard filesystem quota: a fast
writer can overshoot between sweeps. Reserve disk/inode headroom and alert on the
host filesystem; external users must never share this filesystem with a database.
Paused measurement introduces latency and runtime overhead; size the sweep budget
from measurements rather than assuming the nominal interval is its completion time.

Member attachments use the same Computer write port at generated
`inbox/<run-id>/<attachment-id>` workspace paths. The read-only root needs no
exception. Every port write completes trusted metering before acknowledgement;
attachment bytes, generated parent directories, and helper-input volume entries
count toward the ordinary limits. Cumulative write accounting includes transfer
JSON/base64 and filesystem writes, so it is deliberately more conservative than
the attachment's logical size. The backend's 1 MiB/file and 32 files/Run bounds
fit the default budget for a fresh home, but existing usage can refuse delivery.
There is no attachment quota bypass or silent budget reset. Overrun stops compute
and the backend preserves its explicit withheld/uncertain delivery outcome.
Direct command writes remain subject to periodic containment.

Protected command environment and UTF-8 stdin values use the existing private
helper input, removed before the child starts. Stdin is a pipe, never a new mount
or persistent home file. Hard limits, disabled container logs and isolated helper
startup apply to these commands as well. The real-Engine gate verifies hash-only
stdin/environment delivery, one-command scope and bounded inbox delivery.

Admission is serialized across the supervisor. Each retained home reserves
`H + 64 MiB` (`H` is the configured writable budget, plus one encoded snapshot).
Stopped homes and destroyed computers with a committed revision still count.
An import temporarily reserves an extra `H` for its replacement volume. Obsolete
snapshot revisions are pruned after committing the current revision; generation
tombstones remain. Quotas are local to one supervisor, not fleet-wide. Deploy one
supervisor per state volume and stable namespace. Route a computer consistently;
do not run two writers against that state.

Idle and lifetime stops contain processes before attempting a bounded trusted
snapshot of the stopped home. A snapshot failure preserves the last committed
revision and working volume for operator recovery; a later replacement restores
only that committed revision. Storage/measurement stops do not snapshot hostile
oversized homes. Ordinary stop still commits a snapshot or reports its failure.
Backend reads reconcile supervisor stops through a generation/fence-checked
PostgreSQL transition and normal conversation events. Quota refusals return additive
`unavailableReason` values through the existing lifecycle response; transport
failures do not fabricate stopped state. Reads never provision.

Startup and periodic maintenance remove only resources carrying this supervisor's
exact ownership label and absent from its durable inventory, including abandoned
candidate, setup and meter containers/volumes. Startup discards only private
uncommitted atomic temporary files; committed metadata and current revisions are
retained. Archive operations serialize to bound supervisor memory under concurrent
stop/snapshot requests. Retained homes and tombstones survive
restarts. Startup contains previously running computers (including ones paused by
a crashed meter) before admitting callers; unknown command handles never resume. Structured `sandbox.start`, `sandbox.stop`, `sandbox.usage`,
`sandbox.accounting_refused`, `sandbox.orphan`, `sandbox.destroy` and `sandbox.snapshot_refused` events
contain identifiers, state, reason, runtime and numeric usage only. Aggregate by
Space for cost and abuse alerts; never log commands, paths, frames, file contents,
Engine error bodies or credentials. Bound journal retention separately on the host.

## Sizing

Let `R` be maximum running computers, `M` the per-computer memory ceiling, `C`
the per-computer CPU allocation, `H` the writable budget, `N` retained homes,
`S=64 MiB` the snapshot reservation and `B` measured image/runtime/host overhead.
Choose RAM at least `R*M + B + meter/snapshot peak`, CPU at least
`R*C / chosen_oversubscription + supervisor/meter reserve`, and free storage at least
`N*(H+S) + H for one import + images + backup staging + overshoot reserve`.
For measured quotas, reserve at least `aggregate_write_rate * worst_sweep_duration`
and an independently monitored inode margin. Include gVisor Sentry/gofer overhead
and its effect on effective application memory; measure the intended workload.
Use the running/storage limits to enforce that budget rather than depending on
average usage. Add another dedicated host only with explicit placement and local
quota accounting; this implementation does not provide fleet scheduling.

### Small dedicated host profile and capacity probe

For 4 vCPU and about 7.6 GiB RAM, start with six headless computers at 512 MiB,
one CPU and 128 guest PIDs each. Tenant memory ceilings total 3 GiB. Reserve at
least 2 GiB for host/runtime/supervisor overhead plus a 512 MiB meter/snapshot
peak; measure the remaining margin. With chosen CPU oversubscription of two,
`6 * 1 / 2 + 1` consumes the four-CPU planning budget. This does not guarantee a
CPU reservation under simultaneous saturation. Six runsc cgroups permit at most
`6 * (128 + 256) = 2304` host tasks, plus trusted helpers and host services.
The default 8 GiB storage reservation admits 25 full 320 MiB retained-home charges;
replacement admission additionally reserves its temporary home. Keep independent
free-space/inode and overshoot margins. Never retain the template's sixteen-running
default on this size of host without new measurements.

Use a conservative three-running limit when enabling the graphical image for all
computers. Testing three active desktops alongside three headless sessions in the
graphical image establishes that specific mix, not six active graphical sessions.
The headless production profile keeps `SANDBOX_GRAPHICAL=false` and limit six.

`packages/dev-cli/src/validation/sandbox-capacity.ts` probes an explicitly prepared
standalone supervisor using its protected environment. For example, as root on
that host, with a reviewed temporary host-local access exception:

```sh
bun --env-file=/etc/raypx-sandbox/supervisor.env \
  packages/dev-cli/src/validation/sandbox-capacity.ts \
  --url http://10.77.0.2:4020 --limit 6 --screens 0 \
  --output /root/raypx-capacity-headless.json
```

The private listener normally refuses local TCP requests; do not weaken its
WireGuard rule permanently. A temporary loopback-only test allow must follow the
tenant INPUT DROP hook and precede the control-port deny, preserving strict tenant
hook priority across restarts. Remove it after testing. Keep the API peer absent.
The probe starts one computer per fresh test Space, verifies the next start returns
`DEPLOYMENT_RUNNING_LIMIT`, records sequential create/screen latency and idle
memory/CPU/PID headroom, then destroys only its generated computers. It does not
establish fully loaded throughput. A graphical-image run with `--screens 3` tests
three desktops plus the remaining headless sessions. Retained test revisions and
metadata still charge storage after destroy; drain the isolated test supervisor
and remove only that recorded test inventory before returning to service. Never
apply that cleanup to an existing operator deployment.

## Upgrades, backup and incidents

Drain new starts, stop computers through lifecycle APIs, verify Engine containers
are stopped, and back up both supervisor state and its owned home volumes. Keep
metadata, committed revisions, namespace, image/runtime versions and encrypted
volume backups together. Use host-side offline volume snapshots or a trusted
read-only backup job; never execute backup scripts supplied by a tenant. Encrypt
off-host backups and enforce independent retention/access. Validate restores on a
separate isolated host before treating backups as recoverable. Do not back up
WireGuard private keys or tokens into an unprotected home archive.

Install releases side by side, preload images, validate configuration and run both
runtime gates on disposable resources before switching `current`. Reload Docker
only when its supported runtime configuration changes; a required daemon restart
belongs in a dedicated maintenance window. Preserve homes/state for rollback.
Never delete a volume because a replacement or snapshot failed. A changed state
format is rejected rather than silently imported.

For abuse or suspected escape: close admission at the private firewall, stop only
this supervisor's owned tenant containers, revoke its bearer and WireGuard keys,
isolate the dedicated host from the backend, and retain content-free usage and
host audit evidence under restricted access. Treat unknown external effects as
unknown; do not replay them. Rebuild the host from trusted images, patch kernel,
Docker and runsc, restore only reviewed homes/revisions, rerun the complete gate,
then reopen admission. A Docker/supervisor compromise is a compute-host compromise.

## Acceptance and remaining boundaries

Run the full commands from [sandbox acceptance](sandbox.md#owned-real-engine-gate)
with the explicit Engine socket and egress opt-in, once without `--runtime` and once
with `--runtime runsc`. The gate first covers headless provider conformance, isolation,
home replacement, privilege/kernel controls, PID/memory/disk exhaustion, peer
network isolation and public/private/metadata/DNS controls. Optional graphical acceptance then runs
separately against the graphical image: its failure is recorded as unavailable
and does not become a claim of graphical success. Evidence is under
`.artifacts/sandbox-hosting/<runtime>/`. A runtime registered in `docker info` is
not a passing test. An unavailable graphical stack must remain disabled with its
recorded runtime failure; do not advertise Screen based on an unrun image.
With egress enabled it also verifies host socket peer credentials, byte rate,
start/Space-day budgets, connection limits, abuse ports and datagram policing
before conntrack. Both runc and runsc passed the live graphical cases on the
recorded arm64 Engine VM and the dedicated Ubuntu 26.04.1 amd64 KVM guest.
The latter used kernel 7.0.0-43 and Engine 29.9.3/API 1.56, with 12/12 provider
cases, 24 safety/input/network/lifecycle groups and 2/2 graphical cases per runtime.
Its systemd crash hook, firewall-loss containment and six-computer capacity/mixed
three-desktop admission passed. Its host-side WireGuard interface has no peer;
backend transport/API integration and IPv6 remain unaccepted. Other host/runtime
combinations still need their own gate.

A requested graphical image receives a bounded session-start/PNG startup probe.
Failure disables Screen and reports `GRAPHICAL_RUNTIME_UNAVAILABLE` through
provider description and screen availability; headless operations remain available.
A later member screen-start failure also reports that reason for the affected
computer generation; it does not disable another Space’s computer.
The optional graphical image is supported only where its real runtime conformance
passes. Headless remains the production template's default. Other CPU/platform
combinations, rootless Engines, encrypted-channel deployment, physical host
hardening and restore drills require their own acceptance. gVisor narrows the host
kernel interface; it is not a VM or a promise against every kernel/runtime exploit.
Public HTTPS can carry tunnels or abuse; this policy does not inspect content
or prevent all attacks on public destinations. Host network limits bound forwarded
traffic and tracked flows, not all provider ingress or control-plane costs. Measured
storage allows transient overshoot and snapshots cap regular file bytes at 32 MiB.
Maintain host disk alarms, network abuse controls and a patch/incident process.

Runsc graphics require an ordered desktop: Xvfb socket, Openbox EWMH readiness,
mapped browser, then mapped/focused terminal. The old helper spawned the browser
before the window manager was ready; controlled runs stranded it with only the
window manager mapped. Waiting for EWMH readiness fixed the race within the same
eight-second shared budget and ten-second outer limit. No memory/PID increase,
GPU/DRI device, capability, host namespace, writable root or larger shared memory/
tmpfs was needed. The 512 MiB/128 guest PID defaults and sizing formulas still apply.
