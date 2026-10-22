# API and RPC

App: `apps/api` ([AGENTS](../../../apps/api/AGENTS.md)). Nitro + one Hono Fetch app:
`/api/auth/*`, `/rpc/*` (oRPC) and `/health`; every other path is a JSON 404.

## Add a procedure

1. Define input/output with Zod in `packages/contracts/src/api.ts` (`apiContract`).
2. Implement it in `apps/api/server/api.ts` with `os.<group>.<name>.handler(...)`,
   resolving the session from `context.headers`.
3. Call it through `@raypx/client` (`createApiClient`); read it in UI with TanStack Query.
4. Map failures to safe error codes; UI translates codes, never server prose.

- Local device messages belong in `contracts/local`, never on public RPC.
- Client calls are POST and never retried automatically.
- RPC responses time out after 15 s (`REQUEST_TIMEOUT`); inputs with `__proto__` keys
  are rejected before handlers run.
- Web must not reimplement API behavior in TanStack Start server functions.
- Runtime composition: `server/runtime/shared.ts` (database, logger, mailer, auth);
  `node.ts` for the process runtime, `app/cloudflare.ts` per Worker request.
