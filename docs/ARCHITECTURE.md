# Architecture Guide

The current architecture is documented in [the root architecture guide](../ARCHITECTURE.md).
It covers package boundaries, runtime initialization, request context and safe
errors, liveness and readiness probes, and resource shutdown.

The active application is TanStack Start with Nitro's Bun preset. SQLite and
Drizzle, Better Auth, unstorage, and evlog exist as server packages. They are
not all activated by the web application. In particular, probes never create
unused provider connections, and auth imports have no database side effects. Enabling accounts creates
and registers the database at the application composition root.

Shared TypeScript presets come from `@raypx/config/tsconfig/*.json`, with
`@raypx/config/tsconfig-presets/*.json` compatibility exports. Runtime
configuration lives in the separate `@raypx/env/server` package.

The browser foundation is `@raypx/client` for validated HTTP and
`@raypx/client/react` for reusable public data queries and mutations. React stays outside
the client core. `@raypx/ui/hooks` contains component behavior such as debounce;
UI has no business workspace dependencies. Start owns request-isolated SSR
query integration in `apps/web`. The former `api-client` and `hooks` packages
are removed; use these explicit entrypoints.

Product-specific hooks default to `apps/web/src/features/<feature>/hooks`,
alongside their feature contracts and browser clients. Promote a capability
only after demonstrated cross-application reuse, stable validated contracts,
browser safety, and clear framework adapters, with documented public exports
and tests. Keep application workflows and stores in web. Component behavior
belongs in `ui/hooks`; Start providers and SSR composition belong in web.
See [placement and official references](../ARCHITECTURE.md#feature-placement-and-promotion).

- [Browser Client and React Adapters](../packages/client/README.md)
- [Runtime Configuration](../ENV.md)
- [HTTP and Lifecycle APIs](../packages/api/README.md)
- [SQLite Connection](../packages/db/README.md)
- [Authentication Status](../packages/auth/README.md)
- [Engineering Tools](../packages/config/README.md)

The template now includes account tables, explicit migrations, optional auth
endpoints, metrics, request guards, validated caches, async hooks, and shadcn
primitives with Storybook. See [Reusable foundations](FOUNDATIONS.md).
PostgreSQL, OAuth, email delivery, external metric storage, and alert delivery
remain application extensions.
