# Internationalization

`@raypx/i18n` owns static English/Chinese catalogs, device language preferences and
platform adapters. `@raypx-kit/intl` is an independently published SDK that bundles
`use-intl` for translation, formatting, React context and caches; Raypx does not
declare `use-intl` itself. Application
builds choose catalog delivery through `@raypx/i18n/vite`. Web splits non-default
catalogs into local client chunks; Desktop and server rendering use static imports.
There is no remote translation service or localized routing.

## Types and configuration

The locale runtime is the source of supported locale types and preference parsing.
Product translations are authored in `packages/i18n/locales/<language>/<namespace>.ts`.
Each file exports a static object with `as const`; English and Chinese share namespace
files and keys. Each language directory has an authored `index.ts` that composes
its namespace modules through static `.js` imports. Register new namespaces in both
language entries. `locales/index.ts` supplies the static public catalogs;
`locales/lazy.ts` supplies browser loaders. Catalog data and delivery live together.
There is no generation step or duplicate catalog source.
The English catalog preserves literal strings for namespace, key, ICU argument and
rich tag inference. Each Chinese namespace satisfies the recursive `CatalogShape`
of its English counterpart. The catalog gate also checks static object shape,
namespace/key parity, ICU syntax, argument names and rich tag names without executing
catalog modules. Runtime loading remains per language.
Language controls are generated from the locale configuration and a complete
native-name map. Application code imports hooks through `@raypx/i18n` platform
entries. Dynamic keys are narrowed with domain types or explicit mappings.
Blocks owns the shared language setting, using UI's shadcn Select; i18n
provides the locale options and preference state without visual dependencies.

Errors are translated through known key mappings and an explicit, typed fallback.
External interpolation values are cleaned before a single dynamic type bridge.
Diagnostic server text is never displayed as product copy. UTC, silent runtime
errors and namespace-qualified missing-key fallback remain SDK defaults; catalogs
are not automatically filled from a different language.

## State and persistence

`useLanguagePreference().setPreference()` is the only product locale setter.
The stored preference is `system` or an exact supported locale. Resolution uses
explicit preference first, then all ordered system locales, then the default.
Selecting English while system already resolves to English still changes and
persists the mode. A system-derived locale is never stored as an explicit choice.

The shared `LanguageProvider` is controlled by the platform owner. The browser
adapter binds it to a catalog store, keeping the previous ready catalog visible
while another language chunk loads. Only a first render without a ready catalog
suspends. Translation hooks use the nearest upstream provider.

### Web

The root loader resolves cookies and the complete weighted Accept-Language list.
HTML and the first hydration render consume the same snapshot. Only after
hydration does the browser read localStorage and `navigator.languages` (falling
back to `navigator.language` when the list is empty).

Web enables `i18nCatalogs({ catalogs: "lazy" })` in its application Vite config.
English remains in the client entry; Chinese loads on demand. Its client entry
awaits `preloadCatalog(document.documentElement.lang)` before hydration so the
initial client catalog matches the HTML. Server environments stay static.

Browser restoration reads only `raypx_locale`; a missing or invalid value selects
system. Retired product keys are ignored without deletion or migration. Storage denial
retains the loader snapshot. Native snapshots remain authoritative and do not restore
WebView preferences. `languagechange` refreshes the full candidate list.

### Desktop

The native preferences file keeps its existing schema and atomic writes. Preload
passes a snapshot directly to the renderer, distinguishing valid, missing and
failed reads. A valid file is authoritative. A missing file permits renderer
default initialization. An invalid or unreadable file starts from safe defaults.
LocalStorage synchronization is best effort and cannot replace the native snapshot.

The renderer enables native writeback only after initialization. It cannot write
the temporary default `system` over preferences that have not yet been restored.
The native file, CLI profiles and account sessions remain independent; logout
does not clear device preferences.

## Verification and release

Use type rejection tests, controlled provider tests, browser hydration and storage
tests and native bootstrap tests. Test both locale
requests concurrently and keep SSR hydration configuration identical. Package
archive checks verify Bun/Node imports and public declarations without DOM types.
Packaged Desktop checks remain explicit gates; unit tests do
not claim physical-device or GUI acceptance.

SDK changes are developed through an uncommitted `bun link`, pinned to a verified
`next` snapshot on the branch and replaced by the released exact alpha before
merge. Do not commit a `file:`/`link:` dependency or import another repository's
source. See [Raypx Kit library changes](../development/intl-release.md).
