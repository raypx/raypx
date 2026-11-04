# ADR 0040: Instance enrollment and provider boundaries

Status: Accepted on 2026-11-02; foundation implemented on 2026-11-03; provider workspaces consolidated on 2026-11-04 (see [Amendment](#amendment-one-providers-workspace)). Supersedes earlier account-free startup statements in ADR 0035/0039. Server-owned Agents and migration remain later deliveries. [ADR 0041](0041-provider-capabilities-and-pi.md) adds managed local Pi.

## Instance authority

Every Desktop/CLI profile registers once to one account and normalized API origin. A ten-minute approval code is inspected and explicitly approved from the signed-in Web account page; Desktop can approve its own pending enrollment through its native authenticated client. CLI uses `raypx login`; `RAYPX_API_URL` selects the deployment (default `https://raypx.pro`). For a separate Web origin, set `RAYPX_WEB_URL` as well. Open the printed account URL, inspect the device and approve the code. The private polling token remains in CLI memory and is never sent to the renderer or printed. Restart an expired login to obtain a new code.

The device generates an Ed25519 key pair. The private key is stored as PKCS8 DER in `instance_credentials` in the existing `profile.sqlite`, using its Drizzle migration and borrowed writer on every platform. POSIX directories/files use 0700/0600 permissions; Windows restricts the directory DACL to the current user and SYSTEM with inheritance covering SQLite auxiliary files. The API validates proof of possession before creating an enrollment. PostgreSQL stores hashed tokens/codes and public identity metadata; it never receives the private key.

Approval binds the instance UUID, public key, name, platform and app version to one account and origin. The server returns an Ed25519-signed, versioned receipt with a monotonic revision. The client pins the issuer key from the HTTPS enrollment response and verifies the binding before saving it atomically. HTTP is accepted only for loopback development. The current signing seed is domain-separated from AUTH_SECRET: preserve AUTH_SECRET across deployments. Changing it changes the issuer key; existing profiles reject the new issuer and retain their last verified offline state. Automated issuer rotation/re-enrollment is intentionally unsupported and requires a separate migration decision.

A registered profile works offline indefinitely, including after online sign-out. Logout removes affected remote credentials, not the instance identity, local history, preferences or jobs. Another account or origin cannot take over the profile. Use a separate profile for a different identity; do not copy a receipt without its database-held key. These checks protect product ownership and accidental profile reuse; they are not a security boundary against the OS user modifying their own executable or storage.

Old Keychain entries and old credential files are neither read, imported nor deleted.
A profile with an existing identity but no database private key stays unavailable, retaining
its history and file grants. Select an explicit new CLI `--profile` or Desktop
`local_profile` to enroll a fresh identity; online logout never resets it.

## Revocation and execution

The daemon checks a signed status at startup and every five minutes; Desktop also requests a refresh on reconnect. Failed network requests leave the last verified receipt unchanged. A successful signed revocation is persisted, blocks subsequent work and cancels/drains owned Agents, commands, jobs, terminals and remote channels before releasing their resources. UI checks are supplementary: private IPC, direct Agent start, scheduled jobs and AI completion enforce registration in CLI.

Registration is separate from remote Host opt-in, device grants, file grants and provider credentials. It uploads no local files, prompts, task history or model secrets, and enables no remote execution. Only explicit later grants allow remote coordination. Instance registration lives in `@raypx/instances`, transport in Contracts, PostgreSQL in API/Database, local key/receipt storage in CLI, native origin/session policy in Desktop, and account approval/revocation UI in Web. No application imports another application.

## Provider contracts

Core owns pure provider identifiers and presentation metadata. `@raypx/providers/core` owns injected session/factory, normalized conversation events and process transport ports; the `./codex` and `./claude` entries own their wire protocols, conversations and approval mappings. The CLI private harness owns process transport, persistence, policy, turn lifecycle, project locking and cancellation. Applications and models consume metadata/capabilities rather than conditional provider labels or a fixed provider count.

A session factory can start either an external process or an in-process SDK stream. The coordinator does not require an executable or process exit code. Its private CLI ports declare persistence, conversation recording and lifecycle effects without importing concrete stores or recorders. Local record schemas and activity drafts live in the private Agent model; SQLite storage and the conversation recorder implement those ports. Persistence commits synchronously before an approval can resume inference; async writers cannot satisfy the write port. Session completion and kill drain all owned activity before releasing the project lock; deterministic replay covers late events, approvals, queued inputs, continuation, cancellation and SDK drain. Raw provider envelopes never enter the coordinator.

`AgentTask` remains the only persisted Run record. Core Run transitions conform to local waiting/resume/cancelling and owner-loss behavior. No parallel Runtime, Run table or receipt store is introduced. The foundation kept Pi private and experimental. ADR 0041 adds selectable local Pi (`@raypx/providers/pi`) through the same approval, recovery, cancellation, usage and session conformance contract.

## Validation

Focused provider/CLI tests cover process replay and an in-process session with delayed drain. Instance domain tests cover expiry, tampering, possession, ownership and revocation. HTTP/PostgreSQL acceptance runs against a newly created isolated test database; no migration is applied to an operator or retired database. DOM tests cover registration and offline/mismatched/revoked states. Repository policy and affected verification remain required. Cross-process SQLite persistence, failure paths, history clearing and connection release are checked without Keychain wrappers. Windows DACL/native IPC and packaged native acceptance are platform gates and must be reported separately from source checks.

Provider availability includes a versioned definition for runtime kind, supported modes, approvals and model selection. Concrete adapters own their definitions; discovery supplies current availability/input modes. Execution validates capabilities independently of the UI.

## Amendment: one providers workspace

2026-11-04. The foundation split providers into `provider-core`, `provider-codex`, `provider-claude`, `provider-pi` and the test-only `infra/provider-testing`. Each had CLI as its only runtime consumer, and the Codex and Claude adapters had no external dependencies, so the split added manifests, task configurations and lockfile entries without an independent consumer boundary. They are now one private ESM source library, `@raypx/providers`, with explicit `./core`, `./codex`, `./claude`, `./pi` and `./pi/context` entries. The old package names have no aliases.

The adapter boundary is unchanged. Provider code never imports CLI, auth or database source. Concrete adapters reach `./core` but not each other. Raw envelopes stay in their adapter. The source-layer rule still keeps `./codex`, `./claude` and `./pi` out of every layer except infrastructure adapters. The workspace is universal; only the Pi entries and `src/pi/**` target Node and may import `@raypx/ai` or `@earendil-works/pi-agent-core`. Shared host, transport and conformance helpers moved to the library's `tests/helpers`, which runtime entries never import. Split an entry into its own workspace again only when a second execution consumer establishes that boundary.
