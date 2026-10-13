# Internationalization library and product configuration

Reusable internationalization is maintained as `@raypx/intl` in
[Raypx Packages](https://github.com/raypx/packages/tree/main/packages/intl).
Its root/client/server/types/testing entrypoints separate locale negotiation,
formatting and ICU translation, React runtime and browser storage, request
resolution, public types and catalog validation. It has an independent version,
changelog and Changesets release history.

The library receives an explicit locale configuration. Supported language tags,
fallbacks, Cookie names, localStorage keys, catalogs and named formats are not
hardcoded to the product. Each runtime and React client factory owns its own
configuration/context; one application cannot overwrite another application's
language configuration. Full configured regional tags remain distinct, with
explicit locale fallback matching. Pure/server runtime entrypoints do not load React. Native Intl owns formatting,
and FormatJS `intl-messageformat` supplies the ICU translation engine and its
runtime parsing dependency. Catalog parity helpers are isolated in `./testing`;
React is an optional peer used by `./client`.

## Raypx facade

The private `@raypx/i18n` workspace remains the product configuration facade.
It configures `en`/`zh`, English fallback, native display names, the `locale`
Cookie, its existing lifetime and the `raypx_locale` localStorage key. It owns
migration from `voidmix_locale`, which occurs only when the new key is absent.
An invalid explicit new preference never restores the old value.

The facade also owns the `data.error` transport envelope, error-code mappings
and primitive translation-value filtering. These are product compatibility
contracts, not generic library protocols. Web, Desktop, API and Mail keep their
existing imports and behavior; their JSON catalogs and namespace types remain
application-owned.

Translation, locale parsing, Cookie construction, formatting, synchronous and
asynchronous React state, catalog loading race protection and ICU parity are
implemented once in `@raypx/intl`. The facade configures or re-exports them rather
than maintaining copied runtime implementations. Existing product tests cover
locale choices, preference migration, errors, format options and provider behavior.

## Packaging and releases

Before npm publication, Raypx consumes the actual compiled package archive from
`vendor/` through the root catalog. Its checksum and tested source commit are
recorded alongside it. API/Web/Worker Docker install stages already copy this
bridge before their frozen Bun installs. See [archive provenance](../../vendor/README.md).

Toolkit checks source/types, React regressions, actual tarball contents, isolated
Bun/Node consumers and independent versioning. Raypx then runs the owning i18n
suite and `bun run verify`, including catalogs, boundary policy, application
checks, tests, builds and runtime probes. No database schema change is involved.

[ADR-0030](./decisions/0030-independent-intl-library.md) records this ownership.
