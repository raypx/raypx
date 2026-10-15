# @raypx/i18n

## Purpose

Raypx's English/Chinese catalogs, locale preferences and platform entry points.
Translation and formatting use the independently released `@voidmix/intl` facade.

## Interface

- Root/server/types: pure locale negotiation, formatting and translation helpers.
- `messages`: static English and Chinese foundation catalogs.
- `preferences`: pure system/en/zh preference parsing and resolution.
- `browser`: browser language provider, hooks and device persistence.
- `native`: platform-neutral React provider/hooks for native composition.
- `client`: compatibility React facade with browser storage adapters.
- `testing`: test-only catalog checks.

## Ownership

Own product language choices, translations, namespace parity and the persisted
`raypx_locale` preference. Applications provide native storage and system locale.

## Constraints

- Root and native entries must never transitively import browser APIs, filesystems
  or catalog tooling. Use static imports, with no Vite-specific catalog discovery.
- Device preference supports system/en/zh; absent or invalid values follow system.
- Browser follows `languagechange` and cross-window storage events.
- Native callers hydrate async storage before mounting the language provider.
- Preserve safe error-code translation; diagnostic prose is never product copy.
- Voidmix is an external dependency, not a workspace.

See [foundation architecture](../../docs/architecture/0034-extensible-foundation.md).

## Verification

```sh
bun run --cwd packages/i18n check
bun run --cwd packages/i18n test
bun run i18n:check
```
