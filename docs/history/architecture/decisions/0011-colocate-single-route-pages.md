# ADR-0011: Colocate single-route pages with their routes

## Status

Accepted

## Context

Web and Desktop required thin route modules mounting separate feature pages.
For pages with one route consumer, this duplicated the route hierarchy without
creating a reusable interface. Desktop pages also repeated their route IDs in
`getRouteApi` calls and required hand-written lazy imports despite Start's
automatic route code splitting.

## Decision

Define single-route page components beside `createFileRoute` in the route file.
Keep those components module-private and use `Route` hooks for typed params,
search, and loader data. Colocate extracted route-only helpers and their tests
using TanStack's `-` ignore prefix so they do not generate routes.

Keep shared feature interfaces under `src/features/`, including Auth forms,
Admin composition, and the Desktop shell. Extract substantial page internals
when doing so improves readability or provides a useful testing interface;
there is no requirement to give each route a separate `page.tsx`.

Use TanStack Start's automatic component code splitting for these routes.
Loaders, search validation, SSR settings, error handling, and navigation
behavior retain their existing responsibilities. Keep the Web project detail's
keyed component so changing project IDs resets its form state.

## Consequences

Route configuration and its page can be understood in one file, with fewer
imports and repeated route IDs. Route files can be larger, so shared UI and
data access still use their existing interfaces. Runtime business rules and
authorization remain behind the API; this decision only changes renderer
source organization.

Production builds must retain separate component chunks. Route integration
tests cover loading, cancellation, refresh, not-found states, and navigation.

## Follow-up

Extract a page interface when a second route needs it, or when a route's
implementation develops independently testable or reusable parts.
