# @raypx/computers

`/server` owns team-computer lifecycle and database-free ports. `/server/postgres`
owns Space-scoped persistence and transactional computer.state events for every
Conversation in that Space. API resolves fresh SpaceScope and injects the provider.
Member directory/file reads use that scope, never provision compute, and expose
explicit unavailable states. Previews cap at 200 entries or 64 KiB of file bytes.

Read never provisions. Start lazily claims the unique team row under the Space lock.
Lifecycle leases serialize backend callers; a start increments the provider generation.
Completion compares generation and lease fence. Claims are idempotent under the
Space lock when another caller already reached the requested running/stopped
state; a stale service read cannot replace its generation. Lifecycle leases are
independent of Run execution leases and the per-Agent Computer-use gate owned
by Agents. Private scope is constrained but has no writer yet.
No configured provider is an explicit state; it does not allocate rows or host processes.
Never persist vendor names or credentials. Failed operations keep the home revision.

`ComputerScreensService` exposes capability-gated screen lifecycle, bounded frame
streams and member input. The PostgreSQL screen repository stores one expiring
control grant per Space/computer, bound to generation, member and viewer identity.
Control acquisition and member/Agent input share a transaction advisory lock;
provider input must finish within its intrinsic deadline before that lock releases.
Takeover pauses only Agent pointer/keyboard input. Screenshots remain readable.
Every start/end commits append-only Space audit evidence with the grant change.
Membership cleanup calls `revokeComputerScreenControl` inside its existing Space
transaction. Stream cleanup releases only its own account/viewer/generation.
Cross-process viewer registrations expire after ten seconds. Acquisition requires
a live registration; stream heartbeats only update existing rows. Disconnect
deletes the registration and grant under the same lock, so a delayed acquire or
heartbeat cannot restore control after cleanup.
View reads and viewer heartbeats use fresh non-locking admission, so a long Agent
command cannot freeze viewing or expire an otherwise live viewer. Invalid grants
are refused immediately; audit cleanup tries the mutation locks without waiting
and is deferred to the next admission if an input operation still holds them.
Streams refresh session/membership and state at least every five seconds, limit
frames to four per second and one MiB, expire after five minutes and refuse an idle
provider after ten seconds. Neither frame nor input content is persisted or logged.

Run check and test. test:postgres requires a freshly created disposable *_test database;
never run against an existing operator database. Tests use only their own fixtures.

Device Computers are separate member-owned machines. `createDeviceComputersService` owns pairing, directory grants and per-member conversation selection; `createDeviceConnectorRegistry` routes bounded, credential-authenticated outbound channels. The PostgreSQL repository journals sequenced connector outcomes before ACK, validates the exact Space/member/root requester and Run fence on every dispatch, and retains revoked selections as unavailable. Split roles inject the existing private broker through `DeviceConnectorBroker`; constructors start no connection or scan. A grant is one device Computer row and requires local confirmation every time. It is not sandbox isolation. Home export/import/snapshot and Screen are unavailable on devices.

DeviceMemberFilesService uses expiring owner/Space/grant/fence-checked member
reads, without Run authority or commands. Member file routing is transient
PostgreSQL state and cleanup is bounded.
