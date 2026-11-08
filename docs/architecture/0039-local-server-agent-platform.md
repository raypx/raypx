# ADR 0039: Local and server Agent platform

Status: Accepted for planning on 2026-11-01. This defines the greenfield target; current `PRODUCT.md` and implementation remain the shipped baseline until replaced.

Implementation update (2026-11-05): [ADR 0041](0041-provider-capabilities-and-pi.md)
has made Pi selectable for device-local managed tasks through `@raypx/providers`.
Its original experimental status below is historical. [ADR 0045](0045-tauri-node-pnpm.md)
defines the current Tauri/Node/pnpm stack; server ownership and pairing here remain
targets tracked in the [roadmap](../roadmap.md).

## Context

Raypx is moving toward persistent Agents that can work on a user's own computer and continue on a server when useful. A local-only product cannot reach the user while the computer is off. A server-only product makes local project access and data ownership less direct. Replicating one Agent as two writable copies would create competing Run, approval, and workspace histories.

## Decision

Support standalone local, standalone server, and explicitly linked local/server operation. Deliver them in that order. Both deployments use the same Agent domain and Run protocol, with distinct composition roots and persistence adapters. Avoid a second Agent Runtime until the local composition is proven.

A standalone local instance is the first implementation target. [ADR 0040](0040-instance-enrollment-and-providers.md) requires one initial account-bound enrollment, followed by indefinite offline use. The existing CLI daemon owns the first Agent Runtime, its `AgentTask` Run records, `AgentStore` SQLite journal, credentials, private Agent conversations, memory, local files, provider calls, approvals, and recovery. `ManagedExecution` remains the owner of provider turns, inputs, approvals, cancellation and project-lock release. Desktop is a control surface over that daemon and closing the window does not stop local work. The first acceptance uses the existing Codex CLI adapter. Codex and Claude adapters now live in provider packages behind normalized events and a session factory; the future Raypx-owned engine will use the Pi SDK after its durability contract is proven. Pi remains experimental and is not a selectable task provider in this foundation. local model endpoints work without a network, while external models and connectors require an explicit connection and receive only the context needed for a request.

A server instance is a later deployment of the same CLI Agent Runtime. The first migration target is one headless process with a persistent SQLite profile; PostgreSQL, independent Workers, object storage and multi-tenant sessions are later scale options. A server-owned Agent has one authoritative configuration, conversation, Run history, approval history and event stream on that server.

In linked mode, the server runs the shared Agent Runtime and owns Run transitions, model calls, approvals, effects, and visible conversation events. A paired local Host is a Computer/tool provider for selected projects; it does not run a second copy of that shared Agent Runtime. The Host opens an outbound authenticated connection, receives narrowly scoped commands, enforces its local project grant, and returns bounded tool results and visible execution events. It never exposes an inbound listener.

For the first linked release, the paired Desktop daemon is the Computer provider. The Desktop window is only a client; the daemon remains responsible for the Host/project binding and continues after the window closes. This gives a persistent project target and reconnectable process lifecycle without requiring a container or VM. It is a trusted local process with the user's OS permissions, so the project grant limits scope but does not provide sandbox isolation. A later container or VM provider must implement that stronger boundary behind the same Computer contract.

Pairing alone does not upload a directory, credentials, local-only Agent history, or raw terminal streams. File content requested by a shared Run may transit through server memory to the selected model provider. The Host does not copy those files into a server workspace by default. Server model credentials remain in the server's encrypted secret store; local-only Agent credentials remain in the local OS credential store where available.

The execution target is immutable for a Run and records the selected Host/project. Each Host command carries the current grant revision and generation; the Host checks the grant on every command, so a Run manifest does not preserve access after revocation. If the paired Host is offline, the Run waits or fails according to its policy. It never falls back to a different server directory or computer. A user may explicitly create a new Run with another authorized target.

Local-only Agents are never synchronized implicitly. Moving one to a server is a reviewed export/import that excludes secrets and local workspace contents by default. The server becomes authoritative only after import succeeds. Future collaboration synchronizes projections and commands for server-owned Agents, not competing copies of one Agent database.

The local deployment uses SQLite and local-file adapters. Start as a modular monolith. Complete and exercise the local CLI flow first, including tools, approvals, effects, memory, and recovery, while reusing the existing task store, receipts, activity, provider adapters, local approvals, memory and jobs. Then run the same CLI Agent Runtime headlessly as a single server composition on a persistent SQLite volume. Only after that path is useful should reviewed export/import, Host pairing, PostgreSQL, horizontal Workers, object storage and stronger isolation be introduced. Persistence, tool authorization, approval, effects and recovery remain Raypx responsibilities at both composition roots.

## Pairing Protocol

- A Host grant binds a server account, host generation, selected project roots, and allowed capabilities. Grants are revocable and have an authorization epoch.
- Every command has an immutable ID and payload hash. The Host journals accepted commands locally; the server stores receipts. A retry uses the same ID and payload.
- Host events carry a durable increasing sequence. Reconnect resumes from the acknowledged cursor; a gap requires an authoritative snapshot before incremental events resume.
- Revocation fences the old Host generation, rejects new commands, and cancels pending work. An in-flight effect with an unknown result is marked uncertain and is never replayed automatically.
- The server approves the exact tool, arguments, and resource version. The Host independently checks its current local grant before touching a project. Both checks must pass for a protected effect.

## Consequences

- A person can run private Agents offline and use the same product with a server-owned Agent across Web, Desktop, and later mobile.
- Shared Agent state has one owner, while local project files remain under the Host's control.
- A shared Agent that targets a local project cannot make progress while that Host is offline. Automatic cloud fallback is intentionally unavailable because it could target different files.
- Linked Runs send requested context and visible results through the server and selected model provider. The product must disclose this before enabling a shared Agent on local files.
- The first local and headless server compositions use the same SQLite-backed runtime/store; if PostgreSQL is introduced later, it must pass the same domain conformance suite.
- Pairing, remote revocation, cursor recovery and at-least-once command delivery are required before a server-owned Agent can safely use a local project, but are not prerequisites for local or server-workspace runs.

## Rejected Alternatives

- Server-only execution: it cannot use local projects without copying or separately mounting them.
- Two writable copies of the same Agent: it has no single answer for Run ownership, approval order, or recovery after a partition.
- Transparent mirroring of local-only Agents: it violates the local data posture and requires conflict semantics that the first release does not need.
- Local Host running a second copy of a migrated shared Agent Runtime: it would split model/tool lifecycle, persistence, and approval authority across two runtimes.
- Starting with a server deployment: it would delay validation of the local CLI workflow and add cloud ownership, relay, and recovery risks before the primary local use case is proven.
- Creating a parallel Agent/Run store and Runtime beside `AgentTask`/`AgentStore`: it would make local recovery, approvals and provider sessions disagree before the product semantics are stable.
