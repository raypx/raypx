# Device computers

A member can connect a machine to a Space and select one locally confirmed
directory for their next Run in a conversation. PostgreSQL owns selection, Runs,
leases, approvals, effects, connection state and audit. The connector performs
host I/O through the Computer port and never runs the Agent model or scheduler.

Commands run with the machine user's OS permissions. A directory grant confines
built-in file operations and the command's starting directory; it cannot confine
what an approved executable accesses. **This is not sandbox isolation.**

## Pair and grant

In Space settings, select Devices and Pair a device. The code expires after five
minutes and can be claimed and confirmed once. On that machine, use the bundled
or installed version-matched CLI:

```sh
raypx device pair
# Enter the exact server origin and the code; inspect the account and Space.
# Pairing asks for an explicit local confirmation and starts the connector.
raypx device status
raypx device grant '{"spaceId":"<Space ID>"}'
# Choose a directory and confirm the account, server and Space on this machine.
raypx device grants
```

Desktop pairing uses its configured server origin. Native confirms server-owned
account/Space labels before calling the finite bundled CLI's one-use confirmation.
Directory grants use the native directory picker and a separate Cancel-default
confirmation each time. No token, cookie or credential enters the renderer.
Grant a directory in Devices routes the request to the selected machine, including
when the requester is using another Desktop. Its bounded, expiring local queue is
polled by that machine's native host; the current verified account and origin must
still match before a picker, dialog or confirmation. A headless CLI owner cannot
show an OS dialog: use the explicit interactive grant command above on that device.
The daemon never accepts an unattended grant or a blanket `--yes` confirmation.

Each grant is a new revisioned Space resource. Granting to another Space requires
a new local confirmation. Revoking a directory cancels its active operations;
revoking the device invalidates credentials and closes its outbound channel.
Devices shows connection state and only the caller's selected-Space grants.
Revoked selections remain unavailable until explicitly changed. Native Mobile
does not execute host commands; approvals and selection still go to the backend.

```sh
raypx device revoke-grant '{"grantId":"<Grant ID>"}'
raypx device revoke
raypx device stop
raypx device start
```

Stop affects this connector only. Retained `raypx daemon` and its local tasks are
separate. Never stop a daemon or delete a profile you do not own.

## Ownership and approval

Selection is per member and conversation; a direct conversation belongs to its
Agent. Existing Runs retain their pinned computer and generation. Another member's
messages, another routine owner's Runs and delegated work with a different root
requester cannot use this machine. Every dispatch refreshes current membership,
grant state, originating requester, parent chain, different-member steering and
the current Run lease/fence. Deployment roles and selectors grant no access.

A Run with untrusted initial provenance or recalled/retained untrusted context
cannot newly receive a device computer. This deliberately also refuses a later
Run when the conversation's retained history has become untrusted. A trusted Run
already admitted to the machine retains its pin after its own tool results;
normal untrusted-change approval rules still apply. No dependency classifier
tries to prove that a later command is unrelated to outside text.

Device commands ask in Ask, Auto and Never ask unless the member has the documented
exact executable Allow rule. Block always wins; untrusted changes still ask even
with Allow. Auto's reviewer never approves device commands. The card shows the
device, directory and the complete bounded executable/argv/cwd representation.
Commands whose representation exceeds 4,096 characters are refused rather than
showing a clipped command for approval. Permission is checked again after waiting
for the Computer driver; removal of an Allow refuses before effect intent instead
of waiting for another approval while holding that driver. File writes use the existing approval and
effect policy. Local directory consent does not replace server action approval.

An offline initial admission uses the runner's bounded retry path and never
switches to a sandbox. Disconnect, fence loss or cancellation after dispatch can
leave an unknown effect. Existing effect guards refuse automatic replay; neither
connector journaling nor a terminal receipt promises exactly-once host effects.

## Channel and storage

The separate `device` command namespace opens one outbound authenticated WebSocket
to `/device/connect`. It publishes no inbound listener, local method router or
provider credential. The private Desktop session channel remains independent.
Native possession endpoints refuse browser Origin headers. Session RPCs use the
existing trusted-Origin, quota and fresh membership gates. Native HTTP requests
are stream-bounded to 16 KiB and rate limited by trusted client address and
credential digest. Credentials are never placed in URLs.

Protocol version 1 is explicit. Commands carry an immutable operation ID, canonical
payload hash, grant revision, Run fence, connection fence and expiry. The connector
persists accepted identities before I/O and journals sequenced outcomes. PostgreSQL
commits outcomes before ACK; duplicate sequences must match the original operation
and event exactly. Reconnection rotates the restricted credential and advances the
connection fence. A lost rotation welcome preserves only the actually presented
credential until readiness acknowledges its replacement. Old fences cannot clear
or renew a newer connection.

The private connector directory is under the explicitly selected CLI data/profile
directory. It uses the existing restricted file permissions and owner locks; its
credentials, local grant inode identities, finite confirmation tokens, bounded
operation journal and outbox stay separate from Desktop session SQLite. Account
and canonical server-origin binding cannot be transferred. Storage exhaustion
fails closed. Local status never returns credentials or confirmation tokens.
Logout/password security revocation invalidates server access; local file grants
cannot restore that authority.

Combined roles route directly. Split API/worker/Relay roles reuse the existing
private broker through an injected device-only adapter and separate namespace.
PostgreSQL remains the authority; Redis transports frames only. Configure the
same `DEVICE_CONNECTOR_ORIGIN` canonical public API origin in split API, worker
and Relay deployment inputs; an omitted or mismatched worker/Relay origin fails
closed. Combined API defaults to its configured public auth origin.

## Bounds and platform limits

- Built-in paths reject absolute paths, `..` components and symlink components.
  Descriptor-relative no-follow I/O also checks locally confirmed root inode
  identity. Command cwd receives the same admission checks.
- Files use bounded list/read/write calls. Device reads/writes cap at one MiB;
  output shares one MiB across stdout/stderr, sent in bounded chunks. Command
  environment is explicit and does not inherit the connector's credentials.
- Cancellation drains owned process groups. An executable that deliberately
  escapes its process group remains outside this containment claim.
- Connector frames cap at 1.5 MB; local request/confirmation queues and journals
  are bounded. Pending native requests and confirmations expire after 60 seconds.
- Native picker aliases whose shown path differs from the canonical directory are
  refused; choose a canonical path. Each request/confirmation is one-use and a
  cancelled dialog needs a new explicit request.
- Home export/import/snapshot and Screen are unavailable for device computers.
  Revocation never invokes sandbox destruction on a host directory.
- Real filesystem/process/daemon acceptance was run on macOS arm64. Linux and
  Windows remain unverified. Windows built-in file operations fail closed because
  the descriptor-relative implementation has no verified secure equivalent there.
  Source Go tests establish no packaged WebView, OS dialog or installed-app pass.

## Acceptance

Use only an isolated disposable test database. The real subprocess test is part
of API's serial PostgreSQL mode and creates a private temporary home, connector
owner and API fixture. It pairs using the test native-confirmation hooks, grants a
temporary directory and has the deterministic model read/write files and execute
an approved command. It verifies files, durable effects, revocation and cleanup.

```sh
TEST_DATABASE_URL=postgres://raypx@127.0.0.1:55439/raypx_next_test NODE_ENV=test \
  bun run --cwd apps/api test:postgres -- tests/postgres/node/device-daemon.test.ts
bun run test backends --database-url postgres://raypx@127.0.0.1:55439/raypx_next_test \
  --with-e2e -- device-computers.spec.ts --workers=1 --repeat-each=3
```

The browser journey uses the real backend/approval path and a nonexecuting fake
connector. It cannot establish a native prompt or real filesystem effect. Keep
its evidence separate from the actual daemon test and packaged native acceptance.

Protected command input requires connector protocol 2. Version 1 frames and stored
credentials are rejected; use a fresh profile and pair again. A protected frame
carries environment/stdin values only in memory. The destination joins receipt
identity; the value and its digest do not. Output is scrubbed before local outbox
or server event storage, including common encodings on a best-effort basis.
See [protected input](../architecture/protected-input.md). Existing native grants,
member ownership, approvals and unknown-outcome rules still apply.
