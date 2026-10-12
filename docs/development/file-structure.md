# File Structure

Where a new file goes, and why. The listings in [`AGENTS.md`](../../AGENTS.md)
and [`README.md`](../../README.md) say which workspaces exist; this says how to
organise inside one.

`bun run policy` enforces the mechanical parts: every workspace has an
`AGENTS.md`, both workspace listings match reality, and no directory under
`apps/` or `packages/` is empty or lacks a `package.json`.

## The rule that decides everything

**Structure follows the size and number of ownership boundaries, not a template.**
`packages/auth` is 36 lines and one `src/index.ts`. `packages/scripts` is 2,200
lines and splits into `runtime/`, `database/`, `doctor/`, `policy/`, `commands/`.
Both are correct. Add structure when a directory has enough content to need it,
not in anticipation.

Corollary: **there are no empty directories.** Git cannot track one, so an empty
directory exists only in the working tree that created it, where it misleads
anyone reading the filesystem into thinking code belongs there. Policy fails on
them.

## Packages

```text
packages/<name>/
  src/index.ts        the entire package when it is small
  src/<domain>/       once the package is large enough to have domains
  AGENTS.md           purpose, interface, ownership, constraints, verification
  package.json        the exports map is the public interface — keep it narrow
```

`@voidmix/core` is the deliberate exception to a single flat source file. Its
bounded contexts live beside their ports and application services:

```text
packages/core/src/
  identity/   users and audit records
  settings/   typed system policy and mail configuration
  projects/   canonical personal/Organization project access
  projects/   project/task ports and facade
  assets/     immutable versions and sync conflicts
  agents/     runs, steps, leases, and tool capabilities

packages/shared/
  src/        framework-independent errors, value types, and injected defaults
```

Keep the package root as the only public barrel. A context belongs here when it
contains a framework-independent rule or port; an application feature remains
under `apps/*/src/features/` and owns presentation, transport facades, and
fallback data.

The small cross-context primitives used by both Core and adapters live in
`@voidmix/shared`; do not recreate them inside a domain context.

Do not add a `src/types.ts`, `src/utils.ts`, or `src/constants.ts` by reflex. A
type belongs beside the thing it describes until a second consumer exists.

## Applications

```text
apps/<name>/
  src/routes/         route declarations, single-route pages, and local helpers
  src/features/<f>/   shared features and application-specific Admin composition
  src/env.ts          browser-safe app environment composition
  server/             Nitro host wiring and server-only environment composition
  src/router.tsx      router construction and type registration
  public/             served verbatim at the site root — favicon, robots.txt
  AGENTS.md
```

**A page used by one route belongs with that route.** Define its component in
the route file along with metadata, validation, and loaders. Local form state
and page composition can stay there. Keep page components module-private and
use `Route.useParams`, `Route.useSearch`, and `Route.useLoaderData` directly.
TanStack Start automatically splits route components; an extra `page.tsx` and
hand-written lazy import are not required for lazy loading.

Extract substantial internals when they have a useful interface. Route-only
helpers, components, and tests can sit beside the route with a `-` prefix:

```text
src/routes/projects/
  route.tsx            layout with Outlet
  index.tsx            list route and page
  $projectId.tsx       detail route and page
  -components/         optional route-local components, ignored by the router
```

Do not create those extra directories until they are needed. Features shared
across routes, plus Admin's existing adapters and composition, remain under
`src/features/<feature>/`:

```text
src/features/users/
  client.ts             API facade, DTO to view-model mapping, fallback data
  use-admin-users.ts    hooks, named use-<thing>.ts, taking the client as an argument
  UserTable.tsx         feature-local components, flat while there are few
  components/           only once the feature has more than about three components
```

Feature roots keep their shared components, view data, fixtures, types, tests,
and styles. Do not add a `page.tsx` that only wraps two feature components;
let the route compose them directly. When a feature grows beyond
about three internal presentation components, move those components into its
local `components/` directory without adding a barrel export. TanStack
file-based route groups use parenthesized directories such as `(auth)` and
`(app)`; a `route.tsx` inside the directory defines the group layout without
adding the group name to the URL.

Desktop routes use directories instead of dotted filenames to represent URL
nesting. For example, `routes/projects/route.tsx` owns the segment layout,
`routes/projects/index.tsx` owns the list, and `routes/projects/$projectId.tsx`
owns a project detail. A segment layout must render `Outlet` for its children;
the list belongs in the index so it cannot hide a detail route. Root
`__root.tsx` and `index.tsx` remain at the top of `routes/`.

Promote a component to `packages/ui` when a second application needs it — not
before. A component used by two features in the same app moves up to that app,
not to the shared package.

Keep transport configuration, persistence, and fallback policy behind existing
client/data interfaces. Moving a page beside its route does not move backend
business rules into the renderer. A page can call an API facade and own local
interaction state. When a feature has more than one data source, keep the source
adapters behind one small facade. Preserve keyed page components when changing
route parameters must reset their state. See
[ADR-0011](../architecture/decisions/0011-colocate-single-route-pages.md).

## Tests

Tests are usually co-located with the code and the layer is encoded in the
filename: `*.test.ts` unit, `*.integration.test.ts` integration,
`component.test.tsx` component. Component tests live in a directory named for
the subject under test, so the filename does not repeat `.component`. A workspace may also use a top-level
`tests/` directory for shared fixtures or tests that span multiple source
areas; its path must be included explicitly by that workspace's
`vitest.config.ts`. See [testing](./testing.md) for the layer table and the
Vite+/Vitest boundary.

TanStack file-based route directories use the framework's ignored-file prefix
for route-adjacent tests (for example, `src/routes/-__root.test.ts`). Vitest
still collects these files, while the route generator leaves them out of the
generated route tree.

Write fixtures as override factories rather than literals, so a test states only
what it cares about:

```ts
function user(overrides: Partial<User> = {}): User {
  return { id: "user-1", email: "user@example.com", ...overrides };
}
```

Keep the factory local to the test file. **Extract a shared `packages/test-utils`
only when the same fixture is duplicated in three or more workspaces** — a new
workspace costs a manifest, an `AGENTS.md`, a tsconfig, and a vitest config, which
is not worth paying to deduplicate a few lines.

## Generated output

Never hand-edit it, and keep the formatter away from it — reformatting output that
a generator owns is reverted on the next run, which is permanent churn and defeats
drift detection. Oxfmt reads both `.gitignore` and `.prettierignore`, so an
excluded path may be listed in either:

| Path                   | Produced by                                          | Excluded via           |
| ---------------------- | ---------------------------------------------------- | ---------------------- |
| `src/routeTree.gen.ts` | the TanStack Start Vite plugin, via `dev` or `build` | `.prettierignore`      |
| `packages/db/drizzle/` | `bun run generate`                                   | `.prettierignore`      |
| `.agents/`             | `bun run skills:update`                              | `.prettierignore`      |
| `src-tauri/gen/`       | Tauri                                                | `src-tauri/.gitignore` |

## Repository root

Keep it small. A new root-level directory needs a reason no workspace can serve:

- Procedural automation goes in `packages/scripts` as a typed CLI command, **not**
  a root `scripts/` directory of loose shell files.
- A new surface goes in `apps/` as a workspace member, **not** a nested project
  with its own lockfile.
- Static assets belong to the application that serves them, in its `public/`.
