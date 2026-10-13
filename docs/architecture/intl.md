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
explicit locale fallback matching.

`use-intl` 4.14.9 owns translation, formatting and `IntlProvider`; the independent
library uses its public core/provider APIs rather than maintaining a second ICU
engine, formatter cache or provider runtime. React 19 is a required peer for the
package, including root and server consumers. `./client` groups React providers,
hooks and browser storage; this subpath boundary does not make React optional.
Catalog parity helpers remain isolated in `./testing`, using FormatJS parsing
for validation. Locale negotiation, persistence, asynchronous catalog loading
and factory isolation are the library's extensions around the upstream runtime.

UTC defaults, custom formats and namespace-qualified message fallbacks remain
configured by the library. The default `onError` reports nothing; consumers can
supply upstream `onError`, `getMessageFallback` and `now` options. Locale/catalog
state and async request race protection remain inside each configured factory.

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

Translation and formatting delegate to `use-intl` through `@raypx/intl`.
Locale parsing, Cookie construction, synchronous and asynchronous locale/catalog
state, catalog loading race protection and ICU parity are maintained once in
`@raypx/intl`. The facade configures or re-exports them rather
than maintaining copied runtime implementations. Existing product tests cover
locale choices, preference migration, errors, format options and provider behavior.

## Packaging and releases

Raypx consumes the published `@raypx/intl@0.0.0` through the root frontend
catalog. `bun.lock` records registry integrity, and API/Web/Worker Docker install
stages resolve that public package during frozen Bun installation. The
pre-publication archive bridge is retired.

Raypx Packages checks source/types, React regressions, actual tarball contents, isolated
Bun/Node consumers and independent versioning. Raypx then runs the owning i18n
suite and `bun run verify`, including catalogs, boundary policy, application
checks, tests, builds and runtime probes. No database schema change is involved.

[ADR-0030](./decisions/0030-independent-intl-library.md) records this ownership.
