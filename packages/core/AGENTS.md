# @raypx/core

## Purpose

Framework-independent business rules and the repository interfaces they depend
on. This is the layer that decides what is allowed, separate from how it is
transported or stored.

## Interface

| Path | Purpose                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `.`  | `src/index.ts` — domain exports, repository/transaction ports and rules |

## Ownership

- Own runtime mail and authentication policy types, inherited configuration
  fallbacks, read-only settings ports, and derived public Auth capabilities.
- Own canonical cloud scopes, Conversations, Tasks, Runs, executions, artifact
  revisions, usage intents and transactional repository ports.
- Own the fixed `cloudToolNames` vocabulary shared by API authorization and
  Worker tool registration; mode and child execution select subsets.
- Account usage totals are a transaction query: monthly calls/tokens/cost use an
  inclusive start and exclusive end; stored bytes and active Runs span all time.
- TaskRound freezes its goal, attachments and call/duration budgets. Task points
  to the current round and goal version; Runs and Revisions retain their round.
  Execution grants contain only token hashes and bind actions to a Run owner/epoch.
- Resource owner accounts fund execution, independently of its requesting user.
  Project spending grants are separate from editing capability. Durable message
  projections and ordered events represent the same execution facts.
- Own canonical V2 personal/Organization project access, resource ports,
  Cloud Run cancellation rules and the blob-storage port.
  Device-bound execution and the former Project AgentRun ports are retired.
- Queued Runs are directly claimable under the current authorization, owner epoch
  and lease rules. Outbox, dispatch readiness and task-notification ports are retired.
- Ownership is distinct from authorship. Organization capability is a ceiling;
  a project membership can narrow it but cannot elevate it.
- Own the **repository interfaces**. The dependency direction is inverted on
  purpose: `@raypx/db` depends on this package to learn what to implement.
- Own no transport concern. Business rules throw `DomainError`; only the API
  layer maps those to transport codes.

## Constraints

- **The runtime dependency is `@raypx/shared`.** No React, Hono, Nitro, Drizzle,
  Zod, or oRPC. `lib: ["ES2022"]` means there are no DOM types either.
- Shared primitives are owned by `@raypx/shared` and re-exported here for
  compatibility.
- Entities are plain `interface`s with no methods and no classes.
- Do not restore retired user-administration workflows, audit constructors,
  settings mutation ports, or Cloud diagnostic administration.
- `now` and `id` are injectable with defaults. This is what makes tests
  deterministic — do not reach for `new Date()` or a UUID library inline.
- `DomainError` is the common business-error base. Each bounded context owns a
  closed string-literal code union and may expose a context-specific subclass.
  Optional primitive `values` carry interpolation data for the transport error
  envelope; human-readable messages remain diagnostics and are not a UI
  localization source. Add the corresponding explicit mapping in
  `apps/api/server/api` whenever a context adds a transport-visible error code.
- `getX` returns `T | null` and never throws; mutators return the updated entity
  or `void`.
- Runtime authentication uses exact lowercase email domains. An empty allowlist
  permits every domain. Settings administration factories are retired; the
  repository ports remain only for Auth/Mail resolution.
- An active protocol status value is also declared in `@raypx/contracts`
  (`z.enum`) and `@raypx/db` (`pgEnum`). Active protocol values must change together; a
  missing one fails at runtime, not at compile time.

## Verification

```bash
bun run --cwd packages/core check
bun run --cwd packages/core test
bun run --cwd apps/api test   # exercises usecases through the router
```
