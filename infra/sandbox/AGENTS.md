# Sandbox supervisor

Private Bun service; no exports. Only this service opens the Engine socket.
The backend consumes `@raypx/providers/computer/docker` over authenticated private HTTP.
Never log request bodies, Engine errors, commands, output, paths or tokens.
Validate configuration before opening a listener. Persist generation tombstones and
immutable home snapshots in the supervisor's private state volume. Run one supervisor
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
