# Architecture Guide

The current architecture is documented in [the root architecture guide](../ARCHITECTURE.md).
It covers package boundaries, runtime initialization, request context and safe
errors, liveness and readiness probes, and resource shutdown.

The active application is TanStack Start with Nitro's Bun preset. SQLite and
Drizzle, Better Auth, unstorage, and evlog exist as server packages. They are
not all activated by the web application. In particular, probes never create
unused provider connections, while importing the auth package currently opens
its SQLite dependency.

Shared TypeScript presets come from `@raypx/config/tsconfig/*.json`, with
`@raypx/config/tsconfig-presets/*.json` compatibility exports. Runtime
configuration lives in the separate `@raypx/env/server` package.

- [Runtime Configuration](../ENV.md)
- [HTTP and Lifecycle APIs](../packages/api/README.md)
- [SQLite Connection](../packages/db/README.md)
- [Authentication Status](../packages/auth/README.md)
- [Engineering Tools](../packages/config/README.md)

Database schemas and migration configuration must be added before migration
commands can be used. Authentication routes are not mounted. A PostgreSQL
migration, OAuth providers, external metric storage, or alerting are not
implemented by the current template.
