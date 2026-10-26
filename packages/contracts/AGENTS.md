# @raypx/contracts

## Purpose

Pure transport schemas shared by their consumers.

## Interface

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

`/tasks` exports pure normalized task, device, decision and event schemas. `/api`
adds scoped remote coordination; `/local` exposes private Agent-host methods.
Provider protocol envelopes never enter these public projections.
`/tasks` also exports code-point-safe `taskText` clipping within UTF-16 schema
budgets and `normalizeTaskJson` for JSON persistence boundaries. The latter
replaces lone surrogates and NUL with the replacement character, preserving valid
Unicode pairs; use it on transport JSON, not non-JSON objects such as Date.
Relay schemas normalize commands, sequenced events, snapshots and cursor recovery.
Relay v3 adds observed-session projection/ACK and decision frames; the server still
accepts managed-only v2 clients. Authentication negotiates an explicit protocolVersion. Full activity events are
authoritative checkpoints; activity_delta appends require an entry ID and adjacent
base/new revisions. applyActivityEvent returns undefined when checkpoint recovery
is required. TaskChange scopes subscriptions to events, devices or resets.
HTTP exposes projections and tickets; provider wire messages remain private to CLI.
`/terminal` defines observed-session, request, decision, capability and restricted
host-authorization schemas. `/api` exposes account-scoped observed summaries/details
and host bootstrap/grant/revoke. `/local` keeps host and connector methods private. Plain content is explicitly encoded;
request revision/epoch and decision receipts fence stale or duplicate answers.
Private `agents.local.*` methods scope Desktop task reads and commands by account.
The reserved `LOCAL_WORKSPACE_ID` scopes device-profile work independently of login;
Native preserves this ID while legacy accounts retain deployment-hashed namespaces.
They reuse normalized task/decision DTOs without publishing a local HTTP endpoint.

`/api` also exports configuration DTOs and administrator RPC contracts. Public
settings are an explicit projection; write values reject unknown keys. No secrets.
