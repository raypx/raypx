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
Restoring a version copies input fields into a new revision and preserves current
archival state; only archive/unarchive changes eligibility. Unarchive writes its own
`unarchived` reason. Content-only edits retain their existing project even after it
becomes unavailable; changing project still requires authorization. Creation IDs compare against version one
and never overwrite edits on retry. Resolve only the explicitly selected versions;
never silently update, drop, truncate or execute them. References remain task data,
not new permissions. Unknown execution is never repeated automatically. Resolve reads
current eligibility and exact selected revisions in one consistent repository snapshot.

## Verification

Run bun run --cwd packages/memory check and test.
Component suites separate library mutations/history, picker/snapshot and prompt
budgets. `tests/helpers/client.tsx` owns fresh port fixtures and per-case DOM cleanup;
do not share pending requests or mutable clients between cases.

Archived references can be permanently deleted with an expected revision. Deletion
atomically removes the source and all its versions and frees a document slot;
accepted task and command snapshots remain independent. A body-free deletion
receipt reserves the canonical ID and makes a matching deletion retry idempotent,
so an old pinned reference cannot resolve to a replacement document. API writes
still require the current account, trusted Origin and the memory mutation limit.
SQLite schema version 2 adds the device-owned deletion receipts.

Task and cloud Agent-plan editors show the combined reference/prompt character
budget using Core's exact execution formatter. Selected immutable bodies are read
once per selection and kept only in component memory. Typing recomputes locally;
drafts still store only reference IDs/revisions. Pending/unknown and over-limit
budgets disable both button and form submission, with an explicit retry for read
failures. The runtime keeps its authoritative preflight check.
