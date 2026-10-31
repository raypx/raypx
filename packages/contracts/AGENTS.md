# @raypx/contracts

## Purpose

Pure transport schemas shared by their consumers. Task domain models and rules
belong to `@raypx/core`; transport adapters compose those same schema instances.

## Interface

`/local-client`: renderer-safe methods and reply schemas; createLocalClient validates inputs and outputs, infers replies from the method and prevents caller-selected result generics. Native-only methods stay outside this client.

`/api`: public HTTP account contract. `/local`: versioned local CLI/Desktop protocol. `.` re-exports the API seam.

## Ownership

Pure transport schemas shared by their consumers.

## Constraints

No network, environment, filesystem, database or framework implementations. The local protocol never becomes part of the public HTTP router. Local timestamps use ISO strings. Derive DTOs from exported Zod schemas.

## Verification

```sh
bun run --cwd packages/contracts check
bun run --cwd packages/contracts test
```

`/tasks` owns device projections, grants, relay envelopes and notification schemas.
Import task, decision and event models directly from Core.
`/api` adds scoped remote coordination; `/local` exposes private Agent-host methods.
Provider protocol envelopes never enter these public projections.
Core owns code-point-safe `taskText` clipping within UTF-16 schema budgets and
`normalizeTaskJson` for JSON persistence boundaries. The latter
replaces lone surrogates and NUL with the replacement character, preserving valid
Unicode pairs; use it on transport JSON, not non-JSON objects such as Date.
Relay schemas compose core models into commands, sequenced events, snapshots and cursor recovery.
Relay requires explicit protocolVersion 4 for managed tasks and observed requests.
Unsupported versions receive UPGRADE_REQUIRED without fallback. Full activity events are
authoritative checkpoints; activity_delta appends require an entry ID and adjacent
base/new revisions. Core's applyActivityEvent returns undefined when checkpoint recovery
is required. TaskChange scopes subscriptions to events, devices or resets.
HTTP exposes projections and tickets; provider wire messages remain private to CLI.
`/terminal` defines observed-session, request, decision, capability and restricted
host-authorization schemas. `/api` exposes account-scoped observed summaries/details
and host bootstrap/grant/revoke. `/local` keeps host and connector methods private. Plain content is explicitly encoded;
request revision/epoch and decision receipts fence stale or duplicate answers.
Private `agents.local.*` methods require the reserved `LOCAL_WORKSPACE_ID` owner.
Device-profile work is independent of login and Native preserves this ID.
Domain schemas and helpers are imported directly from Core.
They reuse normalized task/decision DTOs without publishing a local HTTP endpoint.

`/api` also exports configuration DTOs and administrator RPC contracts. Public
settings are an explicit projection; write values reject unknown keys. No secrets.

Relay v4 includes authoritative snapshot sync and frozen task contexts for every
host. `resume.syncId` and `snapshot.syncId` correlate backend-requested snapshots;
background recovery does not require a correlation ID. No capability negotiation
or partial-protocol mode is supported.

Task creation accepts `contextSelection` references only; the internal relay command
carries an authoritative `context` snapshot.
Private `memory.*` IPC always addresses the device-profile library, accepts no
account ID, and uses the same version/CAS inputs as the account library.

`/api` composes `memory.*` from the same `@raypx/memory` document/version schemas.
Resolve accepts explicit revision references and a task target, with an optional
prompt for complete budget validation; the server derives the account from session.

`memory.delete` uses an expected revision and is available only for archived references.
Its acknowledgement is idempotent; accepted task snapshots remain separate.

Local terminal IPC uses account-free strict `approvals.local.*` schemas. Private
`observed.settings/configure/list/get/decide` no longer exist. Public cloud HTTP
`observed.list/get`, relay `observed.decide`, and private `observed.remote` remain.
`host.terminal.*` is Native-only; it scopes cloud opt-in to origin/account.
