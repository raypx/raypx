# TanStack Router and Start

Read this **before** acting on `tanstack-router-best-practices` or
`tanstack-start-best-practices` under `.agents/skills/`. Those are vendored
upstream bytes: useful, but wrong in specific places for this repository. Never
edit them — `skills update` would overwrite the edit and invalidate the lockfile
hash. Corrections live here instead.

## Why they are vendored at all

`apps/web` uses parenthesized `(auth)`, `(app)`, and nested `(admin)` route-group
directories, with `route.tsx` as each group layout. `(app)/route.tsx` contains
the Better Auth client session gate, while `(app)/(admin)/route.tsx` owns the
AdminShell layout. Both applications use Start file routes. Desktop uses SPA
mode with client-only route loaders and automatically split route pages; it is not a model
for Web server functions or SSR data access.

Desktop routes use directories for URL segments, with `route.tsx` for a segment
or layout, `index.tsx` for its exact page, and `$param.tsx` for dynamic children.
The `/projects/` list lives in `projects/index.tsx`; `projects/route.tsx` must
render an `Outlet` so both the list and `projects/$projectId.tsx` can render.
Keep remote loaders `ssr: false` so static shell generation makes no cloud calls.
Use `Route` hooks in colocated pages and `router.invalidate` after mutations.
Reserve `getRouteApi` for components kept outside their route file. Keep local
helpers/tests under the `-` ignore prefix so the generator does not treat them
as routes. Start's plugin splits module-private route components automatically;
verify the emitted component chunks when removing manual lazy imports.

## Correction 1: use `.validator()`, not `.inputValidator()`

The vendored skills contain inconsistent validator examples. The current
installed types in `@tanstack/start-client-core` mark `.validator()` as the
canonical API and `.inputValidator()` as deprecated:

```ts
// dist/esm/createServerFn.d.ts
export interface ServerFnValidator<…> {
  validator: ValidatorFn<…>;
  /** @deprecated Use `validator` instead. */
  inputValidator: ValidatorFn<…>;
}
```

**`.validator()` is current; `.inputValidator()` is deprecated.** Confirm
against installed types rather than second-hand documentation when the
TanStack version changes.

## Correction 3: ignore `rules/auth-session-management.md`

It hand-rolls sessions with TanStack Start's `useSession` and Prisma-style
queries (`db.users.findUnique`). Neither matches this repository: sessions are
resolved behind `apps/api/server/api/src/session.ts`'s `SessionResolver` seam,
roles and permissions come from `@voidmix/auth`, and persistence is Drizzle
behind repository interfaces owned by `@voidmix/core`.

Its cookie-hardening table (`httpOnly`, `secure`, `sameSite`, `maxAge`, a 32-plus
character secret) and the "store minimal data, rotate on privilege change"
principles are sound and transferable. The code is not.

## Correction 4: authorization stays server-side

`rules/auth-route-protection.md` shows `beforeLoad` throwing `redirect()` for
unauthenticated users. The pattern is fine for navigation, but in this repository
a client guard is never enforcement: `@voidmix/api` performs the final
check through `requirePermission`. Web's `(app)/route.tsx` layout may redirect
unauthenticated navigation, but adding or changing that guard never lets you
drop the server check.

## What to trust in them

- `tanstack-router-best-practices/rules/load-ensure-query-data.md` — the
  `ensureQueryData` and `setupRouterSsrQueryIntegration` wiring, and the
  `ensureQueryData` versus `prefetchQuery` versus `fetchQuery` decision table.
  Note this repository has no TanStack Query dependency yet; adding one is a new
  decision, not a given.
- `load-use-loaders.md` — the loader argument surface (`params`, `context`,
  `abortController`, `cause`, `deps`, `preload`) and that nested loaders run in
  parallel by default.
- `ctx-root-context.md` — `createRootRouteWithContext` and router context typing.
- `auth-route-protection.md` — pathless layout routes for grouped protection, and
  capturing the post-login target in a validated search param.
- `sf-input-validation.md` — the network-boundary-is-a-trust-boundary framing and
  the mass-assignment example. Its `.validator()` usage is correct.

## Verification after following either skill

```bash
bun run --cwd apps/<app> build   # the Start plugin rewrites routeTree.gen.ts
bun run --cwd apps/<app> check
```

`noUnusedLocals` is on in `apps/web`, so an unused import introduced while
copying an example fails its check.
