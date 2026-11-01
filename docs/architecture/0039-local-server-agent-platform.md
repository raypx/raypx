# ADR 0039: Local and server Agent platform

Status: Accepted for planning on 2026-11-01. This defines the greenfield target; current `PRODUCT.md` and implementation remain the shipped baseline until replaced.

## Context

Raypx is moving toward persistent Agents that can work on a user's own computer and continue on a server when useful. A local-only product cannot reach the user while the computer is off. A server-only product makes local project access and data ownership less direct. Replicating one Agent as two writable copies would create competing Run, approval, and workspace histories.

## Decision

Support standalone local, standalone server, and explicitly linked local/server operation. Both deployments use the same Agent domain and Run protocol, with distinct composition roots and persistence adapters.

A standalone local instance needs no account. Its SQLite database, credentials, private Agent conversations, memory, and local files remain on that computer. A background daemon owns execution independently from the Desktop window. Local model endpoints work without a network; external models and connectors require an explicit connection and receive only the context needed for a request.

A server instance owns its PostgreSQL state, Workers, object storage, and authenticated client sessions. It can be hosted or self-hosted. A server-owned Agent has one authoritative configuration, conversation, Run history, approval history, and event stream on that server.

In linked mode, the server runs the shared Agent Runtime and owns Run transitions, model calls, approvals, effects, and visible conversation events. A paired local Host is a Computer/tool provider for selected projects; it does not run a second copy of that shared Agent Runtime. The Host opens an outbound authenticated connection, receives narrowly scoped commands, enforces its local project grant, and returns bounded tool results and visible execution events. It never exposes an inbound listener.

Pairing alone does not upload a directory, credentials, local-only Agent history, or raw terminal streams. File content requested by a shared Run may transit through server memory to the selected model provider. The Host does not copy those files into a server workspace by default. Server model credentials remain in the server's encrypted secret store; local-only Agent credentials remain in the local OS credential store where available.

The execution target is immutable for a Run and records the selected Host/project. Each Host command carries the current grant revision and generation; the Host checks the grant on every command, so a Run manifest does not preserve access after revocation. If the paired Host is offline, the Run waits or fails according to its policy. It never falls back to a different server directory or computer. A user may explicitly create a new Run with another authorized target.

Local-only Agents are never synchronized implicitly. Moving one to a server is a reviewed export/import that excludes secrets and local workspace contents by default. The server becomes authoritative only after import succeeds. Future collaboration synchronizes projections and commands for server-owned Agents, not competing copies of one Agent database.

The local deployment uses SQLite and local-file adapters; the server deployment uses PostgreSQL and object storage. Shared domain and runtime contracts run through conformance tests against both stores. Start as a modular monolith. Deliver the local vertical slice first, then the minimum server-owned Agent deployment, then link the local Host. Put the selected Agent Runtime behind a Raypx-owned interface and choose it after a focused prototype; persistence, tool authorization, approval, effects, and recovery remain Raypx responsibilities.

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
- Local SQLite and server PostgreSQL must preserve the same domain transitions, even though their storage and transaction implementations differ.
- Pairing, remote revocation, cursor recovery, and at-least-once command delivery are first-release platform work, not later polish.

## Rejected Alternatives

- Server-only execution: it cannot use local projects without copying or separately mounting them.
- Two writable copies of the same Agent: it has no single answer for Run ownership, approval order, or recovery after a partition.
- Transparent mirroring of local-only Agents: it violates the local data posture and requires conflict semantics that the first release does not need.
- Local Host running the shared Agent Runtime: it would split model/tool lifecycle, persistence, and approval authority across two runtimes.
