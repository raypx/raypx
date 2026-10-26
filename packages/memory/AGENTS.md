# @raypx/memory

## Purpose

Versioned user-selected memory and task templates, shared by device and account stores.

## Interface

The universal root owns document schemas. `/server` owns injected library use cases
and repository ports. `/client` owns browser management, context selection, immutable
task-context views and browser-only ports. Concrete SQLite/PostgreSQL, identity,
authentication, routing and device authorization remain in applications.

## Constraints

Use public workspace entries and keep dependencies acyclic. Contracts composes these
schemas; memory never imports contracts or a concrete SDK. Core owns task context
selection/snapshot schemas and prompt-budget rules.

Device-owned documents survive login, account changes and logout and are never
automatically uploaded. Account documents stay with that account and API origin.
Project sources must match the authorized task device and project both at their
current location and selected immutable version. Archive prevents new selections;
already-reserved tasks keep their accepted snapshot.

Each changed mutation commits a new revision atomically, with expected-revision checks.
An archive request matching the current state creates no extra revision. The 100-document
quota includes archived documents; an idempotent create retry is checked before quota.
Restoring a version creates a new revision. Creation IDs compare against version one
and never overwrite edits on retry. Resolve only the explicitly selected versions;
never silently update, drop, truncate or execute them. References remain task data,
not new permissions. Unknown execution is never repeated automatically. Resolve reads
current eligibility and exact selected revisions in one consistent repository snapshot.

## Verification

Run bun run --cwd packages/memory check and test.
