# @raypx/i18n

## Purpose

The Raypx product locale configuration and compatibility facade. Reusable
internationalization lives in the independently released `@raypx/intl` package.

## Interface

```text
@raypx/i18n         product locale constants, configured locale/format/translation helpers
@raypx/i18n/client  configured React providers/hooks and product storage adapters
@raypx/i18n/server  configured request locale resolution and translator factory
@raypx/i18n/types   Raypx locale and catalog types
@raypx/i18n/testing re-exported catalog parity and ICU test helpers
```

## Ownership

- Own Raypx's `en`/`zh` locale choices, native language names, fallback locale,
  locale Cookie settings and `raypx_locale` storage key.
- Keep the `voidmix_locale` preference migration in this product adapter.
- Own translation of the stable `data.error` envelope and safe primitive values;
  never expose server diagnostic prose as translated UI text.
  Error helpers accept a plain translation function without requiring rich-text methods.
- Configure an immutable `@raypx/intl` locale runtime and React client factory.
  Translation, formatting, sync/async providers, request negotiation and ICU
  catalog validation are maintained in the standalone library. Its translation,
  formatting and IntlProvider use `use-intl` 4.14.9; React is a required peer,
  including for server consumers.
- Applications and Mail own their message catalogs and catalog loaders.
- Preserve locale transitions, async catalog race guards, default UTC formatting,
  provider format/timezone overrides and callback failure behavior.
- Existing tests verify product configuration and compatibility through the
  actual package artifact; reusable library tests live with `@raypx/intl`.

## Constraints

- Business code imports translation hooks and translator types from this facade.
  Applications do not import `use-intl` directly.
- Never duplicate standalone internationalization implementations here.
- Product runtime exports must not import catalog testing or build modules.
- Domain and contract packages do not depend on internationalization.
- Toolkit packages use the root catalog even with the `@raypx/` scope.
  `@raypx/intl` is pinned to the published npm version `0.0.0`.

See [internationalization ownership](../../docs/architecture/intl.md).

## Verification

```bash
bun run --cwd packages/i18n check
bun run --cwd packages/i18n test
bun run i18n:check
```
