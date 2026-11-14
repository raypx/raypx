# Retained terminal host and connectors

This guide covers the existing device CLI/daemon and external-provider hooks until
their replacement phase. It is separate from server-owned Agent Runs and the
Computer port. Current Web/Desktop have no project Terminal, Waiting or device
Automations screens. Retained protocol tests do not imply those screens exist.

## Execution and lifetime

On macOS/Windows, Desktop launches the absolute version-matched bundled CLI for
finite `daemon desktop` bootstrap. The detached owner holds profile SQLite,
retained local scheduling/processes, terminal RequestBroker and device Relay.
Native administrative IPC is a private Unix socket or token-guarded loopback on
Windows. The renderer has its own authenticated loopback WebSocket capability;
Go owns OS UI and finite bootstrap, not new Agent execution.

GUI Quit may leave accepted device tasks running; native confirmation can stop the
checked tasks. Tools/PTYS remain scoped to their owner and origin. Explicit daemon
shutdown cancels its work. A crash does not resume uncertain external inference
or effects. The daemon's local ownership locks never grant Space membership.
External commands have ordinary OS permissions, not computer sandbox isolation.

Device enrollment binds one profile to an account and API origin. Its signed
identity supports offline local work after online logout. Remote Host access is
separate and explicit. Account/origin changes, logout and revocation remove the
affected remote binding without reassigning the profile. Provider credentials stay
on the execution device. [Desktop transport](desktop.md#desktop-daemon-channel)
and [local SQLite](local-sqlite.md) describe the retained security boundaries.

## Connector operations

After building a complete standalone CLI payload:

```sh
raypx daemon start
raypx daemon status
raypx connectors --help
# Select a provider accepted by the command's help:
raypx connectors install <provider>
raypx connectors status
raypx connectors uninstall <provider>
raypx daemon stop
```

Only run stop for a daemon you own and intend to terminate. Installation verifies
and copies the complete CLI/terminal payload to a versioned managed directory.
Owned hooks preserve unrelated settings and reject modified/unsupported files,
symlinks or another profile's ownership instead of overwriting them. Repair is
explicit. Hooks forward to an existing owner; a permission request never starts
a daemon implicitly. A failed hook returns control to the original terminal flow.

The retained capability gate supports bounded shell permission allow/deny with
an optional rejection note. Other external protocol surfaces remain disabled
until their own acceptance. Installation does not bypass the provider's hook trust.
The removed renderer settings panels are not an installation/configuration path.
Use command help and retained schemas when maintaining this runtime.

## Remote projection protocol

Retained Relay requires protocol version 5 and rejects other versions. Observed
requests retain invocation/request identity, revision, host epoch, expiry and an
immutable decision receipt. The device host owns the decision; duplicate identical
receipts reuse the result, while changed content cannot apply a second answer.
Decided, delivered and outcome unknown are distinct: writing an answer to a hook
is not proof of its external effect.

Only requests admitted by explicit remote scope can upload. Local-only history,
transcripts and arbitrary tool output are not synchronized. Revocation withdraws
remote eligibility immediately. Restricted Host credentials stay in daemon IPC/
profile storage and PostgreSQL stores their hashes. They never enter renderer,
TOML, URLs or logs. Browser sessions are necessary for viewers and authorization,
not the daemon's ongoing restricted renewal credential.

The retained account projection procedures and native notification/tray code still
have consumers/tests. Do not restore their removed browser UI, publish the local
method router, or treat them as the new Agent approval/effect authority.

## Verification

Default fixtures cover private IPC, hook parsing, receipt fencing, retention,
disconnect ownership, authorization races and revocation without real inference.
Prepared CLI/terminal artifact probes, native transport and real external-provider
gates are separate. Live gates are opt-in, use isolated owned profiles and may
consume inference; they are not part of ordinary `verify`.

See [testing](testing.md#desktop-and-retained-runtime-gates) and
[Desktop release](desktop.md#build-and-release). A loopback/browser fixture does
not establish packaged WebView, actual external hook or unrun-platform acceptance.

## Separate Space connector

`raypx device` now owns the outbound-only Computer connector, its local native/TTY
consent and bounded operation journal. It never starts the retained execution
owner, inbound listeners, local scheduler or private Agent harness. Its grants
are Space/account/origin bound and do not import retained root grants. The
retained `raypx daemon`, hooks, terminals, SQLite history and remote projections
above still serve their independent consumers. See [device commands](device-connector.md).
