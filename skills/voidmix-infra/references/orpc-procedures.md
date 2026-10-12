# oRPC Procedures

Use this when adding, changing, or removing a procedure on the API surface, or
when exposing new data to Web's public or Admin features.

## Ownership

- Schemas, procedures and DTOs live in the owning `packages/contracts/src/`
  domain module; `index.ts` explicitly composes and exports the tree (ADR-0013).
- Core owns business invariants and repository interfaces in domain modules.
  Application commands coordinate canonical resource ports and access checks.
- DB adapters live under `identity/`, `settings/` and `v2/`, behind the existing
  package entrypoints. Update every implementation of a changed port.
- Handlers and runtime composition live in `apps/api/server/api/`. Web owns pages
  and SSR; API is the HTTP composition root.
- `packages/client/src/index.ts` remains fully generic
  (`ContractRouterClient<typeof apiContract>`) — do not add procedure-specific
  client methods. It may be edited for protocol upgrades, transport wiring, or
  oRPC plugins; new procedures still appear on `createApiClient(...)`
  automatically.
- Browser-side Admin facades and hooks live under
  `apps/web/src/features/admin/<feature>/`.

## Order of edits

1. **Contract** — extend the owning domain schema/procedure/DTO module and the
   explicit `apiContract` tree. Reuse common fields and cursor envelopes.
2. **Core/Application** — extend the owning port and command; preserve guard
   order, native dates and optional-field semantics.
3. **Repositories** — update matching implementations. Memory adapters preserve
   clone boundaries; PostgreSQL preserves transaction handles and atomic outbox writes.
4. **Handler** — wire the matching canonical router path, permission/principal
   middleware and owner-local `router-context.ts` helpers. `app.ts` mounts it at
   `/rpc/*`; add transport-visible domain codes to `canonical-errors.ts`.
5. **Test** — exercise contract → real client → injected Hono fetch → router →
   commands → repositories in `apps/api/server/api/app.integration.test.ts`.

## Rules

- **Apply the matching permission middleware through `.use(...)` on every
  protected procedure.** It injects a non-null principal for the handler and
  records the permission result. A new Admin procedure without it is public, so
  add unauthenticated and ordinary-user rejection coverage for each one.
- Business rules `throw new DomainError(code, message)`. Only the API layer maps
  those to transport codes, via `mapDomainError`. The mapping preserves known transport
  errors and wraps unknown failures with their cause; add coverage for new codes.
- Keep `packages/core` pure: its dependencies are `@voidmix/auth` and `@voidmix/shared`, and
  `lib: ["ES2022"]` means no DOM types. No Zod, oRPC, Drizzle, Hono, or React.
- Inject `now` and `id` with defaults in application factories — that is what makes
  tests deterministic.
- `getX` returns `T | null` and never throws; mutators return the updated entity
  or `void`.
- **Dates stay native `Date` end to end**; never serialize to ISO strings.
  `z.date()` in contracts, `mode: "date"` in the Drizzle schema.
  Contracts tests lock native dates and canonical shapes.
- Construct audit events in Core. Application appends them through the
  administration transaction port together with the mutation, only on real
  changes. Never append from a handler; operational logs stay separate.
- Enrich the current wide event with `context.log?.set({ actor, target, outcome })`
  — one event per request, not multiple log lines.
- Procedures are never zero-arg: `client.health({})` needs the explicit `{}`.
- `isMutationProcedure` in Contracts is consumed by both API and Client: GET for safe reads
  and POST for mutations;
  batching, deduplication, compression, retry-after handling, and timeouts stay
  in transport wiring rather than procedure-specific client APIs.

## Footguns

- Contract tree and router tree must match **exactly**. Adding one without the
  other is a type error deep inside `os.router()` whose message does not point at
  your edit.
- A new audit action string needs the matching declarations in
  `@voidmix/core`, `@voidmix/contracts`, and `@voidmix/db`, plus a generated
  migration.
- New request header → also add it to `allowHeaders` in
  `apps/api/server/api/app.ts` when cross-origin browser calls require it.
- Web and Desktop provide an absolute `VITE_API_URL` for the standalone API origin. Authenticated browser requests include credentials; never
  restore actor identity headers as a production authentication mechanism.
- Web's `(app)/route.tsx` session gate is navigation assistance only. Per
  `AGENTS.md`, the API performs the final check; a client-side guard never
  replaces API permission middleware.

## Verification

```bash
bun run --cwd apps/api test    # narrowest
bun run check                  # tsc --noEmit per workspace
```

The integration idiom runs contract → client → RPC → router → application → core ports →
repository in-process, with no network and no database, by handing the Hono app
to the real client as its `fetch`:

```ts
fetch: async (input, init) => app.fetch(new Request(input, init));
```

Assert errors by `code` (`rejects.toMatchObject({ code: "FORBIDDEN" })`), not by
message. Type-check every consuming app after a contract change.
