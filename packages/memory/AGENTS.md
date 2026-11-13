# @raypx/memory

## Purpose

Versioned user-selected memory and task templates: injected server use cases and browser views.

## Interface

`/model` owns the pure Space memory editor, revision guards and injected port.
`/client` exports `SpaceMemoryPanel` for Web/Desktop conversation-header sheets:
Agent/shared groups, Markdown preview, pinning, provenance, removal and revision
restore. Conflict reload retains the draft and updates only the current revision.
The old standalone account/device library page is removed; context picker, budget
and snapshot views remain for the retained task/job consumers.

`/space-server` owns the separate Space/Agent memory service, deterministic bounded
recall and memory change-tool port; `/space-server/postgres` owns its persistence.
API resolves fresh membership. Agent memory references one Agent; shared documents
have no Agent selector. Every mutation creates an immutable revision, including
removal and restoration. Removed current text cannot be recalled. Run checkpoints
pin both revision identities and the exact labelled context; resumes do not recall
again. Tool writes require the current Run lease/fence and use Run/tool-call
identities for idempotency. Shared tool writes require Agent configuration.
Provenance and attribution are data, never instructions or permission. Restoring
untrusted material preserves its provenance. Optional semantic ranking receives
only eligible candidates; no vector service or embedding adapter is installed.

The retained account/device library below is independent. Retire its procedures,
context tables and device selection UI when their remaining consumers are removed;
never migrate their content into Space memory implicitly.

`@raypx/core/memory` owns document/version schemas and errors shared by transports,
server use cases, device execution and browser views.
`/server` owns injected account/device use cases and repository ports for Node hosts;
persistence, identity, project authorization and clocks remain caller-owned. `/client`
and `/server` import Core and never each other.

`/client` owns browser management, context selection, immutable task-context views and
browser-only ports. CLI owns SQLite; `/server/postgres` owns account persistence.
Keep the concrete PostgreSQL entry separate from `/server` so the CLI's injected
device library does not load the server database adapter.
Applications compose identity, authentication, routing and device authorization.

## Constraints

Use public workspace entries and keep dependencies acyclic. Contracts composes the
model schemas; memory never imports contracts or a concrete SDK. Core owns task context
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
Device-owned context tables and deletion receipts live in the shared CLI `profile.sqlite`.
Drizzle applies the embedded profile migration; unmanaged or unknown schemas are rejected.

Task and cloud Agent-plan editors show the combined reference/prompt character
budget using Core's exact execution formatter. Selected immutable bodies are read
once per selection and kept only in component memory. Typing recomputes locally;
drafts still store only reference IDs/revisions. Pending/unknown and over-limit
budgets disable both button and form submission, with an explicit retry for read
failures. The runtime keeps its authoritative preflight check.

## Catalog ownership

Own `memory` in `locales/<language>/`, with handwritten language entries
and pure `/messages/en` and `/messages/zh` exports. Support TS literal objects or
JSON nested strings, one format per namespace/language. Bind private translation
hooks through type-only catalog imports; applications supply the shared provider.
