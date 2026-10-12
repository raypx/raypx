# ADR-0014: Domain application services and scoped renderer state

## Status

Accepted.

## Context

Application already coordinates Project commands, but Identity workflows remain
in Core and the Project interface also owns assets, reviews and activity. Optional
production modules can conceal missing wiring as empty data. Renderer request
state and shared interaction state currently have overlapping owners.

## Decision

Core owns models, invariants, repository/transaction ports and audit construction.
Application owns Identity, Projects (including tasks/members), Assets, Reviews and
Activity use cases. DB implements persistence and transaction boundaries. API and
CLI composition inject required dependencies; HTTP handlers only adapt requests.
This supersedes ADR-0008's allowance for Identity orchestration inside Core.

ProjectAccess is the shared narrow authorization interface. Asset library and
activity lists use authorized database queries. Existing resource ownership,
HTTP paths, native dates and error identities remain stable. Optional pagination
preserves complete lists for older callers that omit both pagination fields.

User administration runs within an explicit transaction port. PostgreSQL uses a
transaction advisory lock shared by status changes and initial admin creation;
all reads, writes and audits use that transaction. Memory provides serialized,
rollback-capable execution. Audit events are constructed only in Core.

Routes own remote data, cancellation and invalidation; URL search owns filters
and pagination. Zustand owns shared interaction state, scoped to its feature and
account. Admin selection, pending operations and message descriptors are ephemeral.
Desktop preferences retain validated persistence. Web SSR never shares mutable
user state between requests. Theme and locale retain their existing providers.

## Consequences

Each service and test fixture needs only its own ports. Production cannot omit a
required capability, and network errors never select preview data. Domain rules
remain independent of transport, renderer frameworks and SQL. The existing
packages remain sufficient; no global store or additional query library is added.

Behavioral fixes are tested separately from responsibility moves. Architecture
policy, PostgreSQL concurrency tests and authenticated browser tests enforce the
boundaries. Agent execution, new upload protocols and activity production are
outside this change.

## Follow-up

Revisit store extraction when two production consumers need the same lifecycle,
and query caching when route-owned loading no longer meets measured needs.
