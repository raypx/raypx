# @raypx/i18n

## Purpose

Raypx's English/Chinese catalogs, locale preferences and platform entry points.
Translation and formatting use the independently released `@voidmix/intl` facade.

## Interface

- Root/server/types: pure locale negotiation, formatting and translation helpers.
- `messages`: static English and Chinese foundation catalogs.
- `preferences`: pure system/en/zh preference parsing and resolution.
- `browser`: browser language provider, read-only Intl hooks, device persistence and LanguageSelect.
  The select accepts an optional icon; it does not depend on UI or an icon library.
  DOM consumers register `src/browser` as a Tailwind source for its control styles.
- `native`: controlled language provider and read-only Intl hooks for native composition.
- `client`: controlled IntlProvider and browser language composition.
- `testing`: test-only catalog checks.

## Ownership

Own product language choices, translations, namespace parity and the persisted
`raypx_locale` preference. Applications provide native storage and system locale.

## Constraints

- Root and native entries must never transitively import browser APIs, filesystems
  or catalog tooling. Use static imports, with no Vite-specific catalog discovery.
- Device preference supports system/en/zh; absent or invalid values follow system.
- Browser follows `languagechange` and cross-window storage events.
- `useLanguagePreference` is the only language mutation entry. Effective locale is
  derived from this preference and the full ordered system-language list; IntlProvider
  receives that locale and one current catalog without another locale state.
- Web first renders the server snapshot, then restores new device storage, the old
  `voidmix_locale` key and cookies. An invalid explicit new key means system. Migrate
  only when the new key is absent and remove the old key only after a successful write.
  Denied reads preserve the initial snapshot; denied writes never roll back the UI.
- Native bootstrap passes `restorePreference={false}` to BrowserLanguageProvider.
  It must wait for `hydrated` before writing device preferences back to the host.
- Native callers hydrate async storage before mounting the language provider.
- Preserve safe error-code translation; diagnostic prose is never product copy.
- Voidmix is an external dependency, not a workspace.

See [foundation architecture](../../docs/architecture/0034-extensible-foundation.md).

## Verification

Pure helpers and streamed SSR use the Node test project; browser/provider hydration
tests use the separate jsdom project so React renderers do not share module context.

```sh
bun run --cwd packages/i18n check
bun run --cwd packages/i18n test
bun run i18n:check
```
