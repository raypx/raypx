# @voidmix/i18n

## Purpose

Shared locale negotiation, React runtime helpers, Intl formatting, and the
`use-intl` facade used by application-owned catalogs.

## Interface

```text
@voidmix/i18n         locale constants, parsing, formatting, translation
@voidmix/i18n/client  React provider/hooks and browser/Desktop storage
@voidmix/i18n/server  request locale resolution and sync translator factory
@voidmix/i18n/types   runtime-only public types
@voidmix/i18n/testing recursive catalog parity and ICU argument test helpers
```

## Ownership

- Own locale normalization, supported-locale metadata, Cookie/localStorage adapters, runtime providers,
  formatters, and the `use-intl` integration.
- Locale changes update in-memory state and persistence before the optional
  document synchronization callback; callback failures do not roll back locale.
- Formatter helpers default to UTC and cache by locale, timezone, and effective
  format definitions. Provider-level timezone and format overrides flow through
  both `use-intl` and the standalone formatter.
- Applications and Mail own their `messages/` JSON catalogs.
- `I18nProvider` remains the synchronous compatibility provider for Desktop,
  Mail, and tests. `AsyncI18nProvider` supports an application-owned catalog
  loader for Web-style locale splitting; it caches in-flight loads, commits the
  locale and catalog atomically, and clears failed loads so callers can retry.
- Applications and Mail own their catalog files. The i18n package owns the
  loader contract but never imports application catalog files.
- Catalog parity tests compare recursive keys, node types, and ICU argument
  names through `@formatjs/icu-messageformat-parser` in the testing subpath.
  It is a direct catalog dependency, isolated from client/runtime entrypoints.
- Error helpers read the stable `data.error` envelope (with an optional
  primitive `values` record) and discard untrusted object values before calling
  a translator. They never expose server diagnostic prose.

## Constraints

- Business code imports translation hooks and translator types only from this
  package; it must not import `use-intl` directly.
- Keep `use-intl` implementation details behind the package facade, including
  its `AppConfig` and translator types.
- `client` and runtime exports must not import compiler or build modules.
- Domain and contract packages must not depend on this package.

## Verification

```bash
bun run --cwd packages/i18n check
bun run --cwd packages/i18n test
bun run i18n:check
```
