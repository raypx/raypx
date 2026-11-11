# @raypx/i18n

## Purpose

Raypx's English/Chinese catalogs, locale preferences and platform entry points.
Translation and formatting use the independently released `@raypx-kit/intl` facade.

## Interface

- Root/types: pure locale negotiation, formatting and translation helpers.
- `config`: static default locale and language names, shared with repository checks.
- `messages`: `locales/index.ts` assembles both language catalogs; each language
  directory owns its namespace modules and `index.ts` entry.
- `preferences`: pure system/en/zh preference parsing and resolution.
- `browser`: browser language provider, read-only Intl hooks and device persistence.
  Language controls belong to Blocks, composed from UI primitives and these hooks.
  This package does not depend on UI or an icon library.
- `vite`: build plugin choosing static or lazy browser catalog delivery.

## Ownership

Author translations in `locales/<language>/<namespace>.ts` as static default
objects with `as const`. Chinese namespace modules also satisfy the English
module's recursive `CatalogShape`. Keep namespace files and keys aligned, and
register new namespaces in both `locales/en/index.ts` and `zh/index.ts` using static
`.js` imports. These are authored source files with no generation step.
`raypx-dev i18n` checks namespace/key and ICU argument/rich-tag parity without
executing catalogs.

Own product language choices, translations, namespace parity and the persisted
`raypx_locale` preference. Applications provide device storage and system locale.
The controlled LanguageProvider, browser storage/cookie adapters and error-code
translation come from `@raypx-kit/intl`; this package only wires product keys and
catalogs into them. Change that behavior in Raypx Kit, not here.

## Constraints

- The root entry must never transitively import browser APIs, filesystems
  or catalog tooling. Use static imports, with no Vite-specific catalog discovery.
- `#messages` resolves to `locales/index.ts` unless the `/vite` plugin selects lazy
  delivery through `locales/lazy.ts` for a client environment. Without the plugin every consumer stays static.
- Device preference supports system/en/zh; absent or invalid values follow system.
- Browser follows `languagechange` and cross-window storage events.
- `useLanguagePreference` is the only language mutation entry. Effective locale is
  derived from this preference and the full ordered system-language list; IntlProvider
  receives that locale and one current catalog without another locale state.
- Web first renders the server snapshot, then restores only `raypx_locale`. Missing
  or invalid values mean system. Retired product keys are ignored without migration.
  Denied reads preserve the initial snapshot; denied writes never roll back the UI.
- Native bootstrap passes `restorePreference={false}` to BrowserLanguageProvider.
  It must wait for `hydrated` before writing device preferences back to the host.
- Preserve safe error-code translation; diagnostic prose is never product copy.
- Raypx Kit is an external dependency, not a workspace.

See [foundation architecture](../../docs/architecture/0034-extensible-foundation.md).

## Verification

Compile-only assertions in `tests/types/` protect exact keys and ICU arguments.
Pure helpers and streamed SSR have source-adjacent tests in the `server` project.
Browser/provider hydration uses adjacent `*.component.test.tsx` in the separate
happy-dom project, so React renderers do not share module context.

```sh
bun run --cwd packages/i18n check
bun run --cwd packages/i18n test
bun run i18n:check
```
