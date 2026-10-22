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
Relay schemas normalize commands, sequenced events, snapshots and cursor recovery.
HTTP exposes projections and tickets; provider wire messages remain private to CLI.
Private `agents.local.*` methods scope Desktop task reads and commands by account.
They reuse normalized task/decision DTOs without publishing a local HTTP endpoint.

`/api` also exports configuration DTOs and administrator RPC contracts. Public
settings are an explicit projection; write values reject unknown keys. No secrets.
