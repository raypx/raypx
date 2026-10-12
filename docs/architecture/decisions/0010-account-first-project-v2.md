# ADR-0010: Account-first Project V2

## Status

Accepted

## Context

The previous product model coupled projects to Workspace and Project Studio
state. That coupling makes multiple personal projects and a later
Organization scope harder to reason about, and it leaves authorization spread
across transport and persistence code.

## Decision

Build V2 around Account and Project. Every Project belongs to exactly one
personal account or Organization. Keep `createdByUserId` as attribution only,
use project-level memberships for collaboration, and calculate capabilities in
one core evaluator. Use a modular monolith with separate API and Worker
processes, PostgreSQL repositories, an outbox, and direct object-storage
uploads. V2 does not carry Workspace, legacy Project state, Preview migration,
or offline synchronization compatibility.

## Consequences

Multiple personal projects are a natural account query. Organization access can
be added by introducing organization membership and project scope without
changing the resource aggregates. The initial V2 vertical slice is isolated
from the old runtime while commands and adapters are filled in; until the
remaining V2 resource commands land, legacy product routes must not be treated
as the V2 contract.

## Follow-up

Replace the remaining legacy product entrypoints with the V2 project, asset,
review, activity, and AgentRun procedures once their application commands and
tests are complete.
