# @voidmix/contracts

## Purpose

The runtime contract seam. It defines the wire shape shared by the API and every
frontend: Zod schemas, the oRPC contract tree, and the DTOs derived from them.

## Interface

| Path | Purpose                                                               |
| ---- | --------------------------------------------------------------------- |
| `.`  | `src/index.ts` — schemas, procedures, `apiContract`, and `*Dto` types |

`src/index.ts` composes the explicit contract tree and public exports. Domain
schemas and procedures live in `cloud.ts`, `account.ts`, `projects.ts`, `reviews.ts`,
`assets.ts`, and `agents.ts`; `common.ts` owns shared fields, envelopes and
procedure construction. `methods.ts` owns HTTP method classification for API and client.
See [ADR-0013](../../docs/architecture/decisions/0013-domain-modules-and-retired-code.md).

## Ownership

- `apiContract.cloud` owns the new Conversations, Tasks, Runs, Assets, Usage,
  Notifications, preferences, capabilities and tool-detail protocol. Conversation
  streams deliver durable snapshots; Run streams deliver ordered events.
- Task DTOs expose currentRoundId/goalVersion and immutable Round metadata.
  startRound resets the goal budget; continueRound and retry preserve it.
  Revision acceptance supplies round/version for compare-and-set semantics.
- Run snapshots carry durable message projections, a bounded recent event page,
  the high-water cursor and an older-history cursor. beforeSequence pages replay
  older facts in ascending order. Asset metadata reads never return signed URLs.
- Cloud list/history cursors bind to actor/domain/filter scope. Tool replay events
  contain bounded summaries; full input/output is only in authorized tool detail.
  Notifications target a Task or Conversation and expose a permission-filtered
  unread count.
- Own the request and response shape of every procedure, and the DTO types that
  consumers import.
- API failures use the open transport code plus `data.error.code` and optional
  primitive `values` (`string`, `number`, `boolean`, or `null`). Keep that
  envelope stable so Web and Desktop can translate codes without consuming
  server diagnostic messages.
- The canonical Account-first tree is the only transport API. Retired Workspace,
  Project Studio, scheduled-task, and settings procedures must not return.
- Own nothing else: no network calls, no database access, no business rules.

## Constraints

- Schemas are exported (`export const fooSchema = z.object({...})`); procedure
  definitions are domain-module `const`s exported only to the tree composer named as camelCase verbs whose name
  differs from their key in the tree (`listUsers` → `list`).
- `apiContract` is a plain nested object literal, **not** `oc.router()`.
- DTOs are declared beside their domain schemas as `export type FooDto = z.infer<typeof fooSchema>`.
- **Dates stay native `Date`.** Use `z.date()`; never serialize to ISO strings.
  `src/index.test.ts` covers native dates and canonical contract shapes.
- The contract tree and `apps/api/server/api`'s router tree must match **exactly**. Adding
  to one without the other is a type error deep inside `os.router()` whose
  message does not point at your edit.
- Project/library/activity list inputs accept optional limit/cursor; omission
  preserves complete lists for installed clients. Activity uses an explicit DTO.
  Admin list adds optional role/status filters without changing its pagination.
- Public Auth capabilities expose only registration, verification-request, and
  password-reset-request booleans. Never add settings sources, domain lists,
  missing mail fields, or secret state to that public DTO.
- **A status or audit-action value is declared in three places with no shared
  source**: the literal union in `@voidmix/core`, the `z.enum` here, and the
  `pgEnum` in `@voidmix/db`. Miss one and it fails at runtime (Zod output
  validation or a PostgreSQL enum error), not at compile time.
- Depend only on `@orpc/contract` and `zod`. Never import a runtime package.
- `exactOptionalPropertyTypes` is on repo-wide: mark optional inputs
  `.optional()` and let consumers use conditional spread rather than passing
  `undefined`.

See [`skills/voidmix-infra/references/orpc-procedures.md`](../../skills/voidmix-infra/references/orpc-procedures.md)
for the full edit order across contracts, domain, db, and the API.

## Verification

```bash
bun run --cwd packages/contracts check
bun run --cwd packages/contracts test
bun run --cwd apps/api test   # the contract's real consumer
```
