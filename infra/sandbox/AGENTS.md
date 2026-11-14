# Sandbox supervisor

Private Bun service; no exports. Only this service opens the Engine socket.
The backend consumes `@raypx/providers/computer/docker` over authenticated private HTTP.
Never log request bodies, Engine errors, commands, output, paths or tokens.
Validate configuration before opening a listener. Persist Space ownership, usage/timestamps, generation tombstones and
committed home snapshots in the supervisor's private state volume. Run one supervisor
per state volume; computer operations serialize there. Never share its socket or state
with computers. Provision uses existing images only, never pulls or builds.

The optional `graphical` image target adds a Unix-only X display, browser and
terminal; the final/default target stays headless. `SANDBOX_GRAPHICAL` defaults
false. Fixed display helpers run inside the computer with intrinsic deadlines;
private authenticated HTTP carries bounded PNG/input frames, never a published
display port. Stop/replacement close frame iterators. No framebuffer is logged.

`src/home.py` is baked into the computer image; file operations walk directory FDs
with O_NOFOLLOW. Home archives preserve links without following them and reject special files.
Run `check` and `test` without Docker; tests inject a fake Engine HTTP transport.
Live provider conformance is opt-in via RAYPX_TEST_DOCKER=1 against a prepared service.
Dev CLI's `test sandbox` owns source-supervisor real-Engine acceptance. Prepared
images accept repository digests or immutable local Engine IDs, never mutable tags.

`egress.sh --bridge rpx<10hex> [--resolver public-IPv4] --dry-run|--apply|--remove` owns only that bridge's
Linux host rules. Firewall mutation requires explicit operator opt-in on the Engine
host, using Docker's iptables backend. IPv4 public egress remains available; IPv6
egress is denied. `SANDBOX_DNS_RESOLVER` (default `1.1.1.1`) is the sole embedded
DNS upstream; pass the same value to the script to restrict direct TCP/UDP DNS.
Dry-run tests must never invoke the host firewall.

`SANDBOX_RUNTIME` selects an installed Engine runtime; initialize before listening.
Untrusted mode refuses the Engine default without an explicit override and requires
egress assertions. Production uses runsc and a dedicated host/WireGuard channel.
Provision context carries immutable Space ownership. Serialize quota admission and
resource creation with orphan reconciliation. Never meter from tenant-controlled
code: pause tenants and run bounded no-network trusted volume meters. Cumulative
cgroup writes bound unlinked files; unsupported accounting refuses admission.
Idle/lifetime stops precede bounded snapshots from a trusted stopped-home reader.
Keep only the committed revision, preserving its fence on failures. Usage logs
contain identifiers, enums and numbers only. Update the host guide and gate with
any limit, runtime, storage or private-channel change.

Meter every Computer write before acknowledging inbox attachment delivery; count
generated parents and helper transfer I/O in the existing budgets. Protected stdin
uses a child pipe, with its PID published before blocking writes for cancellation.
Neither private input nor attachment bytes belong in logs or validation evidence.

Hard guest rlimits precede the command-ready prefix; OCI exec errors never enter
command output. Runsc reserves bounded host PID overhead separately from guest
RLIMIT_NPROC and pins DNS via a root-owned read-only volume subpath. Startup drops
only uncommitted atomic temporary files. Serialize home archive I/O to bound
supervisor memory. Optional graphical acceptance is reported separately from the
headless safety gate; screen-start failures retain an explicit availability reason.
