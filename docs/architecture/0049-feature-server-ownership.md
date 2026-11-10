# ADR 0049: Feature server ownership

Status: Accepted, 2026-11-10. Extends ADR 0048 and supersedes the server persistence
placement described in ADR 0043.

## Context

Memory and Jobs owned their server use cases while account-context persistence
lived in Control and job persistence lived in API. Task views and page state lived
in Tasks, but the task read projection lived in Control. A feature's implementation
therefore had to be found in several unrelated owners.

## Decision

Each feature workspace owns its server implementation and browser views through
explicit platform entries. Tasks retains its pure page-model entry; shared domain
schemas remain in Core.

- Tasks/server owns the task read projection and its stored task/event/request
  schemas. Control injects account readers and device-authorized transactions,
  connection release and transport error mapping.
- Memory/server owns injected memory use cases and repository ports.
  Memory/server/postgres implements account persistence.
- Jobs/server owns injected scheduling use cases and repository ports.
  Jobs/server/postgres implements account persistence.
- Control owns device credentials/authorization, project authorization, relay
  command routing/receipts, observed device channels and socket/broker transport.
  It composes the Tasks projection through its public server entry.
- Applications own connections, lifecycle, authentication and public routes.
  Database continues to own table schemas and migrations.

The concrete PostgreSQL entries are separate from injected use-case entries so
device-owned libraries in the CLI do not load account database implementations.
No feature imports Control or an application; the complete dependency graph stays
acyclic, including development dependencies.

## Consequences

Device authorization, connection fencing, task/event/request commits, cursor
updates and frozen-context receipt release stay in one transaction. A disconnect
only clears the actor's current connection. This moves code ownership without
changing persisted or wire formats or weakening account/device isolation.
