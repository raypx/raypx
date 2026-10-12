# @voidmix/core

## Purpose

Framework-independent business rules and the repository interfaces they depend
on. This is the layer that decides what is allowed, separate from how it is
transported or stored.

## Interface

| Path | Purpose                                                                                     |
| ---- | ------------------------------------------------------------------------------------------- |
| `.`  | `src/index.ts` — domain exports, repository/transaction ports, rules and audit construction |

## Ownership

- Own user and audit-event types, status transition rules, self-suspension and
  final-administrator protection, administration transaction ports, typed mail and authentication settings rules,
  source/inheritance models, derived public Auth capabilities, and durable
  audit-event creation.
- Own canonical cloud scopes, Conversations, Tasks, Runs, executions, artifact
  revisions, usage intents, notification preferences and transactional repository ports.
- TaskRound freezes its goal, attachments and call/duration budgets. Task points
  to the current round and goal version; Runs and Revisions retain their round.
  Execution grants contain only token hashes and bind actions to a Run owner/epoch.
- Resource owner accounts fund execution, independently of its requesting user.
  Project spending grants are separate from editing capability. Durable message
  projections and ordered events represent the same execution facts.
- Own canonical V2 personal/Organization project access, resource ports,
  Agent cancellation rules, outbox contracts, and the blob-storage port.
- Ownership is distinct from authorship. Organization capability is a ceiling;
  a project membership can narrow it but cannot elevate it.
- Own the **repository interfaces**. The dependency direction is inverted on
  purpose: `@voidmix/db` depends on this package to learn what to implement.
- Own no transport concern. Business rules throw `DomainError`; only the API
  layer maps those to transport codes.

## Constraints

- **Runtime dependencies are `@voidmix/auth` and `@voidmix/shared`.** No React, Hono, Nitro, Drizzle,
  Zod, or oRPC. `lib: ["ES2022"]` means there are no DOM types either.
- Shared primitives are owned by `@voidmix/shared` and re-exported here for
  compatibility.
- Entities are plain `interface`s with no methods and no classes.
- Identity workflows live in `@voidmix/application`. Core exports pure rules,
  audit constructors and ports; do not add transport or persistence orchestration.
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
- **Guard ordering in `updateStatus` is load-bearing**: not-found →
  self-suspension → last-admin → no-op short-circuit → mutate → `appendAudit`.
  The no-op check comes _after_ the guards, and audit is appended only on a real
  state transition.
- Audit events are constructed here. Application appends them inside the same
  administration transaction as the mutation. They are durable product records,
  distinct from operational logs. Never append audit from a handler.
- Runtime authentication uses exact lowercase email domains. An empty allowlist
  permits every domain. Settings administration factories are retired; the
  repository ports remain for Auth/Mail resolution and adapter mutation semantics.
- Settings mutations are field-scoped: omission retains database state, `set`
  or `replace` writes an override, and `reset` removes an override so the
  repository can resolve its inherited value.
- A status or audit-action value is also declared in `@voidmix/contracts`
  (`z.enum`) and `@voidmix/db` (`pgEnum`). All three must change together; a
  missing one fails at runtime, not at compile time.

## Verification

```bash
bun run --cwd packages/core check
bun run --cwd packages/core test
bun run --cwd apps/api test   # exercises usecases through the router
```
