# ADR 0040: Instance enrollment and provider boundaries

Status: Accepted on 2026-11-02; foundation implemented on 2026-11-03. Supersedes earlier account-free startup statements in ADR 0035/0039. Server-owned Agents, migration and the Raypx Pi engine remain later roadmap deliveries.

## Instance authority

Every Desktop/CLI profile registers once to one account and normalized API origin. A ten-minute approval code is inspected and explicitly approved from the signed-in Web account page; Desktop can approve its own pending enrollment through its native authenticated client. CLI uses `raypx login`; `RAYPX_API_URL` selects the deployment (default `https://raypx.pro`). For a separate Web origin, set `RAYPX_WEB_URL` as well. Open the printed account URL, inspect the device and approve the code. The private polling token remains in CLI memory and is never sent to the renderer or printed. Restart an expired login to obtain a new code.

The device generates an Ed25519 key pair. macOS and Windows use Bun.secrets (OS credential storage); Linux stores PKCS8 DER in a nonsymlink 0600 file under the protected profile. The API validates proof of possession before creating an enrollment. PostgreSQL stores hashed tokens/codes and public identity metadata; it never receives the private key.

Approval binds the instance UUID, public key, name, platform and app version to one account and origin. The server returns an Ed25519-signed, versioned receipt with a monotonic revision. The client pins the issuer key from the HTTPS enrollment response and verifies the binding before saving it atomically. HTTP is accepted only for loopback development. The current signing seed is domain-separated from AUTH_SECRET: preserve AUTH_SECRET across deployments. Changing it changes the issuer key; existing profiles reject the new issuer and retain their last verified offline state. Automated issuer rotation/re-enrollment is intentionally unsupported and requires a separate migration decision.

A registered profile works offline indefinitely, including after online sign-out. Logout removes affected remote credentials, not the instance identity, local history, preferences or jobs. Another account or origin cannot take over the profile. Use a separate profile for a different identity; do not copy a receipt without its OS-held key. These checks protect product ownership and accidental profile reuse; they are not a security boundary against the OS user modifying their own executable or storage.

## Revocation and execution

The daemon checks a signed status at startup and every five minutes; Desktop also requests a refresh on reconnect. Failed network requests leave the last verified receipt unchanged. A successful signed revocation is persisted, blocks subsequent work and cancels/drains owned Agents, commands, jobs, terminals and remote channels before releasing their resources. UI checks are supplementary: private IPC, direct Agent start, scheduled jobs and AI completion enforce registration in CLI.

Registration is separate from remote Host opt-in, device grants, file grants and provider credentials. It uploads no local files, prompts, task history or model secrets, and enables no remote execution. Only explicit later grants allow remote coordination. Instance registration lives in `@raypx/instances`, transport in Contracts, PostgreSQL in API/Database, local key/receipt storage in CLI, native origin/session policy in Desktop, and account approval/revocation UI in Web. No application imports another application.

## Provider contracts

Core owns pure provider identifiers and presentation metadata. `@raypx/provider-core` owns injected session/factory, normalized conversation events and process transport ports; `provider-codex` and `provider-claude` own their wire protocols, conversations and approval mappings. The CLI private harness owns process transport, persistence, policy, turn lifecycle, project locking and cancellation. Applications and models consume metadata/capabilities rather than conditional provider labels or a fixed provider count.

A session factory can start either an external process or an in-process SDK stream. The coordinator does not require an executable or process exit code. Its private CLI ports declare persistence, conversation recording and lifecycle effects without importing concrete stores or recorders. Local record schemas and activity drafts live in the private Agent model; SQLite storage and the conversation recorder implement those ports. Persistence commits synchronously before an approval can resume inference; async writers cannot satisfy the write port. Session completion and kill drain all owned activity before releasing the project lock; deterministic replay covers late events, approvals, queued inputs, continuation, cancellation and SDK drain. Raw provider envelopes never enter the coordinator.

`AgentTask` remains the only persisted Run record. Core Run transitions conform to local waiting/resume/cancelling and owner-loss behavior. No parallel Runtime, Run table or receipt store is introduced. The current Pi SDK loop remains private and experimental; a future `provider-pi` is justified only when it implements the same approval, recovery, cancellation, usage and session conformance contract. It is not selectable in this foundation.

## Validation

Focused provider/CLI tests cover process replay and an in-process session with delayed drain. Instance domain tests cover expiry, tampering, possession, ownership and revocation. HTTP/PostgreSQL acceptance runs against a newly created isolated test database; no migration is applied to an operator or retired database. DOM tests cover registration and offline/mismatched/revoked states. Repository policy and affected verification remain required. Real macOS Keychain, Windows Credential Manager and packaged native acceptance must be reported separately from Linux source checks.
