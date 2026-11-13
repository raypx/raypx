# @raypx/i18n

Own common English/Chinese copy, locale policy, preferences and runtime adapters.
This workspace owns the translation and formatting adapters and the single
`use-intl` dependency. Import only `use-intl/core` and `use-intl/react` from `src/`.
Keep the default catalog pin exact and one resolution in the lockfile.
Other workspaces use `@raypx/i18n` entries and must not declare use-intl, next-intl
or FormatJS runtime dependencies. Tooling owns the static ICU validator.
Never import business catalogs, UI or icons into this package.

## Interface

- Root/types: locale negotiation, generic translation, formatting, search normalization and types.
- `config`: static locale policy, read directly by repository tooling.
- `messages/en`, `messages/zh`: pure data containing only `common`.
- `preferences`: pure system/en/zh parsing and full-list resolution.
- `browser`: `createTranslations<M>()`, `createBrowserI18n<M>(sources)` and shared
  locale/formatting/preference hooks. The preference hook exposes catalog load
  status and retry. Apps own catalog composition and providers.
- `vite`: receives application `staticEntry`/`lazyEntry` URLs; substitutes only
  that application's client `#messages` resolution. SSR stays static.

## Catalogs and state

Author static `locales/<language>/<namespace>.json` in every language, with
handwritten language `index.ts` assembly using `.json` imports and
`with { type: "json" }`. `bun run i18n:types` writes the ignored
`<namespace>.d.json.ts` beside each English catalog so key, ICU argument and tag
call-site types survive JSON's widened strings (ADR 0064); never edit or commit it.
Run it after editing English outside `check`. The static validator checks shape,
parity, ICU syntax, arguments, tags, unique namespace ownership and entry
registration without executing entries, and rejects TypeScript catalogs.

Typed hooks may have different message types but share one SDK messages context.
Only the singleton runtime owns preference context. Never create per-feature
language state or provider contexts. Business hooks use type-only catalog imports;
applications explicitly assemble their own data. Keep loading per language.

`useLanguagePreference` is the only mutation API. Resolve the full system locale
list; do not store a system-derived locale as a fixed preference. Browser restores
only `raypx_locale` after hydration, follows language/storage events and preserves
the initial snapshot on denied reads. Ignore retired keys without migration. Native
snapshots disable browser restoration and wait for `hydrated` before writeback.
Keep UTC SSR/hydration and device time after mount. Keep the active locale and
catalog together across switches and preserve mounted drafts. Default diagnostics
deduplicate supported locale, error code and confirmed catalog keys. Diagnostic
exception prose is never translated copy.

## Verification

Compile-only assertions in `tests/types/` cover TS ICU/tag types and JSON key types.
Source-adjacent server suites cover pure helpers/concurrent streamed SSR; isolated
`*.component.test.tsx` suites cover shared context, hydration, storage and time zones.
Fixtures stay package-local and never import application catalogs.

Run this package's `check`/`test`, root `i18n:check` and `verify`.
See [internationalization](../../docs/architecture/internationalization.md).
