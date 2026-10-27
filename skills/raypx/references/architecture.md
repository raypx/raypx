# Architecture

Canonical sources: [architecture](../../../docs/architecture/README.md),
[foundation decision](../../../docs/architecture/0034-extensible-foundation.md),
[remote tasks](../../../docs/architecture/remote-tasks.md),
[internationalization](../../../docs/architecture/internationalization.md),
[analytics](../../../docs/architecture/analytics.md). Read them before changing a boundary.

## Request paths

- **Web** (TanStack Start SSR, Nitro bun preset) renders with
  device preferences from cookies/Accept-Language and the account from `account.get`,
  forwarding only Better Auth cookies. Route groups split first-load JavaScript:
  `routes/(auth)` is a logo-only layout, `routes/(app)` renders the sidebar shell and
  guards signed-out visitors in `beforeLoad` with `queryClient.fetchQuery(accountQuery())`.
- **API** (Nitro + one Hono Fetch app) mounts `/api/auth/*` (Better Auth),
  `/rpc/*` (oRPC `implement(apiContract)` in `apps/api/server/api.ts`) and `/health`;
  everything else is a JSON 404. API creates the database adapter and mailer and
  injects them into auth.
- **Desktop** builds the renderer as a Start SPA (no server, no server functions),
  served from `views://main`. The native side owns the window, tray, trusted RPC,
  the outbound relay WebSocket and the bundled CLI process.
- **CLI** owns local execution, approval arbitration and the durable replay journal.
  Device preferences and SQLite profiles stay local and survive logout.

## Data and state

- PostgreSQL (`packages/database`, Drizzle) holds only the new auth/account and
  remote projections; it is isolated from the retired product database.
- Remote reads in Web/Desktop go through TanStack Query; `@raypx/tasks` keys queries
  by client instance and account, and relay notifications invalidate them.
- Remote tasks use explicit API projections and device-scoped grants. The local
  method router and provider credentials are never published.

## Libraries and exports

Libraries are private ESM source packages with explicit `exports`. Mixed packages
declare `entryTargets`/`sourceTargets` so platform constraints stay transitive, for
example `@raypx/auth/client` (browser) versus `/hooks` (universal) and `/server`
(no DOM). Theme belongs to UI; only pure tokens/types are available everywhere.
