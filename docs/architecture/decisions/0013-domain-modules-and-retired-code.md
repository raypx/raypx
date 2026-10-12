# ADR-0013: Domain modules and retirement of unused V1 code

## Status

Accepted

## Context

The Account-first V2 runtime superseded Workspace and Project Studio, but their
unused implementations remained exported. Database adapters and contracts also
outgrew the original single-file convention, mixing unrelated responsibilities.

## Decision

Complete ADR-0010 by removing V1 implementations after tracing their consumers.
Retain the blob ports, authentication policy, mail configuration, and canonical
V2 behavior that the current runtime uses. Migrate AI tools to the canonical
application commands instead of keeping a second project repository protocol.

Contracts and database schemas may use domain modules behind their existing
package entrypoints. Keep the contract tree and the schema/relations aggregates
explicit. Database table definitions and migration history remain unchanged;
retiring application code does not authorize dropping persisted data.

Keep handwritten implementation modules below 400 formatted lines by assigning
each responsibility to its owner. Reuse helpers within that owner before adding
cross-package abstractions. Parser libraries own language syntax; repository
tooling owns the checks applied to the parsed source.

## Consequences

Readers follow the same domain names through contracts, commands, and adapters.
Private exports used only by retired implementations and their tests disappear.
HTTP/RPC contracts and active runtime behavior remain compatible. This decision
supersedes the flat-file conventions for contracts and database schema source.

## Follow-up

Revisit a package boundary only when a second production consumer requires it.
