# ADR-0030: Independent internationalization library

## Status

Accepted. Supersedes the shared runtime ownership in ADR-0004; its product locale,
message ownership, timezone and error-safety contracts remain.

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
Keep catalog testing and React runtime behind explicit package subpaths.
Use native Intl and the pure FormatJS ICU engine for the core runtime; preserve
translation, timezone, format and namespace-qualified fallback behavior.
This supersedes the `use-intl` implementation dependency in ADR-0004.

Retain `@raypx/i18n` as a thin product configuration/compatibility facade. It
owns supported `en`/`zh` locales, Cookie/storage settings, the old brand preference
migration and the `data.error` envelope. Catalogs and their application types
remain with the owning applications and Mail. Existing consumers keep their
facade imports while reusable implementations are removed from the product.

Use the catalog archive bootstrap defined by ADR-0029 until npm publication.
Compiled artifacts are verified outside the workspace on Bun and Node; React
provider and async race behavior are checked independently and through the
product facade. Removing `third-party` directories moves full adapted-source
licenses and attribution to package-root `NOTICE.md` and `THIRD_PARTY_LICENSES`.

## Consequences

Internationalization can evolve independently of product releases. New projects
choose their own language tags and persistence keys. Raypx keeps compatibility
without imposing its language configuration or protocol on the public library.
The product facade is an adapter, not a second generic i18n implementation.

The npm publish job remains disabled until maintainers configure publication
identity and scope access. Neither this extraction nor artifact verification
publishes a package to npm.
