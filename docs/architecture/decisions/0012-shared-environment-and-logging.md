# ADR-0012: Merge environment and logging into the shared foundation

## Status

Accepted

## Context

Environment validation and operational logging were separate workspaces even
though they form foundation services consumed across applications, adapters,
and repository tooling. That split required every consumer to coordinate two
workspace dependencies and public package boundaries.

Consumers also resolved workspace TypeScript sources directly. This allowed
imports to bypass one stable package interface and left published build output
unverified. The repository has accepted the additional build and dependency
management cost in exchange for a single shared boundary and consistent public
entry points.

## Decision

Move environment and logger implementations into `@voidmix/shared`, retaining
the explicit `env`, `env/runtime`, `logger`, `logger/client`, `logger/env`,
`logger/hono`, `logger/orpc`, and `logger/vite` subpaths. The root export
continues to own framework-independent primitives. Core keeps its compatibility
re-export of those primitives.

Expose only ESM build output, declaration files, and sourcemaps from `dist/`.
Zod and Evlog are runtime dependencies; Hono, oRPC, and Vite are optional peer
dependencies for their respective logger adapters. Keep type checking and tests
against source. Installation builds the initial output; development and
verification refresh it. The root clean command preserves the shared output so
the repository CLI remains runnable after cleaning.

Environment validation continues to consume values supplied by applications
and tooling; it does not load `.env` files or take ownership of application
variables. Browser environment access remains guarded. Client logging remains
separate from server adapters, and the logger's central redaction policy stays
in force. Domain and API errors continue to use the same shared `DomainError`
class identity.

## Consequences

Consumers use one workspace dependency and resolve every public API through
build output. A clean install and source edits now require the shared build to
run before consumers check or execute. The foundation package has runtime
dependencies and optional adapter peers, so its boundary is broader than the
former zero-dependency primitive package. This change targets consistency; it
does not claim faster application execution or smaller bundles.

The old `@voidmix/env` and `@voidmix/logger` package names are removed without
compatibility aliases. Repository consumers and documentation use the new
subpaths.

## Follow-up

Revisit if the shared package's adapters force unrelated consumers to install
their framework peers, or if packaging the foundation reduces the isolation
between client and server entry points.
