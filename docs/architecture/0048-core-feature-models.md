# ADR 0048: Core owns shared feature domain models

Status: Accepted, 2026-11-10. Supersedes the memory/job model ownership and
dependency consequences in ADR 0043.

## Context

Contracts used the pure model entries of Memory and Jobs, but those workspaces also
depend on browser UI packages. The workspace graph therefore connected transport
schemas to UI even though source-layer checks prevented UI from entering bundles.

## Decision

Core owns memory document/version schemas, local/cloud job schemas, their inferred
types and errors, and pure calendar calculations. Consumers import
`@raypx/core/memory` and `@raypx/core/jobs` directly. There are no compatibility
re-exports from the feature packages.

Memory and Jobs retain `/server` use cases and `/client` views. Both use Core;
neither entry imports the other. Contracts depends only on Core and Instances
among Raypx product workspaces. Source-layer and platform checks remain useful
defenses, while the package graph now expresses the transport/domain boundary.

Calendar calculation uses Croner with paused instances that are stopped before
returning. Core creates no running schedule and owns no runtime timer.

## Consequences

Wire formats, validation limits and persistence formats remain the same. Existing
domain and composition tests move with their implementations or keep testing the
transport composition against the same Core schema instances.

Accepted decision records remain historical. Later changes add a new ADR and a
short supersession link to affected records. The architecture index and topic
guides describe the current implementation.
