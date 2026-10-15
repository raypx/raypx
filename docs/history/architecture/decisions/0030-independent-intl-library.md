# ADR-0030: Independent internationalization library

## Status

Accepted. Supersedes the shared runtime ownership in ADR-0004; its product locale,
message ownership, timezone and error-safety contracts remain.
Repository name, npm scope and pinned version are superseded by
[ADR-0033](./0033-voidmix-library-scope.md).

## Context

The user requested adding internationalization to the independently released
library repository and naming the public package `@raypx/intl`. The existing
workspace combines reusable translation/formatting and React runtime with
product-specific locales, preference migration and error transport behavior.

## Decision

Maintain `@raypx/intl` alongside `@raypx/drizzle` in
[Raypx Packages](https://github.com/raypx/packages), with independent versions,
changelogs, package artifacts and Changesets releases. Use configurable locale
runtime and React client factories; no global mutable application configuration.
Use `use-intl` 4.14.9 as the translation, formatting and `IntlProvider` runtime,
keeping the implementation choice in ADR-0004 while moving its ownership to the
independent library. React 19 is a required peer for every consumer, including
root and server usage. Keep React provider/browser APIs and catalog testing
behind explicit package subpaths; those boundaries do not promise a React-free
core or server package.

The unpublished extraction design is corrected to restore `use-intl`, replacing
the temporary direct ICU/native-formatter implementation before the initial npm
release. The library adds locale negotiation, persistence, async catalog loading
and client factory isolation through upstream public APIs, without maintaining
another translation engine, formatter cache or IntlProvider implementation.
Preserve UTC defaults, custom formats and namespace-qualified fallback behavior.
The default `onError` logs nothing; applications can explicitly configure
`onError`, `getMessageFallback` and `now`.

Retain `@raypx/i18n` as a thin product configuration/compatibility facade. It
owns supported `en`/`zh` locales, Cookie/storage settings, the old brand preference
migration and the `data.error` envelope. Catalogs and their application types
remain with the owning applications and Mail. Existing consumers keep their
facade imports while reusable implementations are removed from the product.

Consume the published npm `0.0.0` versions through the root catalogs, following
ADR-0029. The pre-publication archive bootstrap is retired.
Compiled artifacts are verified outside the workspace on Bun and Node; React
provider and async race behavior are checked independently and through the
product facade. Full adapted-source licenses and attribution are maintained by
the standalone package alongside its source notices.

## Consequences

Internationalization can evolve independently of product releases. New projects
choose their own language tags and persistence keys. Raypx keeps compatibility
without imposing its language configuration or protocol on the public library.
The product facade is an adapter, not a second generic i18n implementation.

React installation is part of the package contract even for server-only consumers.
Both initial public packages are published at `0.0.0`. Later Changesets releases
upgrade each package independently.

The initial versions were published by an authorized maintainer. Automatic npm
publication remains separately gated by repository settings and identity setup.
