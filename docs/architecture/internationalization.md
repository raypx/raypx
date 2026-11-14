# Internationalization

Business packages own their catalogs; applications compose messages. `@raypx/i18n`
owns only common copy, locale configuration, preference state and runtime adapters.
`@raypx/i18n` is the only workspace that declares or imports `use-intl`. Its public
`core` and `react` entries provide translation, formatting and the shared messages
context. The default catalog pins one engine version and the lockfile resolves it
once. Other workspaces depend on i18n's public entries. Tooling owns ICU catalog
comparison and reads i18n's static locale policy through workspace discovery.

## Namespace ownership

| Owner     | Namespaces                                            |
| --------- | ----------------------------------------------------- |
| I18n      | common                                                |
| Auth      | auth                                                  |
| Account   | access                                                |
| Agents    | agents                                                |
| Memory    | memory                                                |
| Jobs      | routines                                              |
| Analytics | analytics                                             |
| Blocks    | settings                                              |
| Pages     | pages                                                 |
| Skills    | skills                                                |
| Mobile    | mobile, mobile-capabilities, mobile-resources         |
| API       | api                                                   |
| Web       | dash, users, site, guest, legal, desktopAuthorization |
| Desktop   | engine, desktopLogin                                  |

Shared owners expose pure `/messages/en` and `/messages/zh` entries without React,
UI or execution code. App catalogs remain private. Web and Desktop compose only their consumed
shared entries and private namespaces through explicit object assembly. Jobs
contributes routines capability copy.
Mobile composes common, Auth, Agents, Jobs, Memory, Pages and Skills plus its
private native catalogs through a platform-neutral translator. Devtools'
private `locales` dictionary loads only with Devtools and never enters app messages.
UI primitives continue to receive caller-provided labels.

## Formats and types

Every language and namespace is `locales/<language>/<namespace>.json`. Handwritten language `index.ts` files
explicitly import and assemble their entries with actual `.json` specifiers and
`with { type: "json" }`; there is no runtime registration. Shared TS presets enable
`resolveJsonModule`; Bun, Vite and Mobile's Metro consume those imports.

TypeScript widens imported JSON values to `string`. `raypx-dev i18n types` writes an
ignored `<namespace>.d.json.ts` beside each English catalog, restating its values as
literal types, and the presets enable `allowArbitraryExtensions` so the compiler uses
it. English therefore keeps key, ICU argument and rich-text tag call-site checks.
The Turbo task `//#i18n:types` produces these files before every `check`; run
`bun run i18n:types` after editing English copy to refresh the editor.

The repository validator reads catalogs statically. It checks supported languages,
nested string leaves, namespace/key parity, ICU syntax, matching argument/tag names,
unique ownership and language entry registration, and rejects a TypeScript catalog.
Shared entries expose only their owner's namespaces; application spreads must
reference same-language public entries and cannot overwrite namespaces. These checks
do not validate call-site arguments. JSON files are explicit validation and
source/build cache inputs.

## Runtime composition

Applications infer their complete message type from their own English language
entry. `createBrowserI18n<M>(sources)` returns their provider, preload function and
typed translation hook. Business packages bind private `createTranslations<M>()`
hooks using type-only imports of the catalog types they need. There are no global
message declarations or imports from applications into shared packages.

All typed bindings read the same underlying SDK messages context. Shared locale,
formatting and preference hooks read that provider, and exactly one runtime binding
owns preference context. `useLanguagePreference().setPreference()` is the only
product language setter. Resolution uses explicit preference, the complete ordered
system locale list and finally the default. A system-derived language is not stored
as a fixed preference. Selecting the currently resolved language still records the
explicit choice.

Loading remains per language. Static sources are ready immediately. A language
switch keeps the previous ready catalog and active locale together, including
document language and formatting. The preference records the user's selection
immediately. Its load status and retry action let language controls recover a
failed download while preserving mounted views and form drafts. Only an initial
render awaiting its first catalog suspends.

Error translation uses known key mappings and an explicit typed fallback.
Default runtime diagnostics emit deduplicated warnings with locale, error code
and any key confirmed by the active or reference catalog. The reference catalog
identifies message keys for diagnostics. Missing messages retain the engine's
qualified-key fallback. Diagnostic exception text and interpolation values stay
out of the diagnostic records.

## Platforms

Web's private `#messages` alias normally resolves to `locales/index.ts` with both
languages. `i18nCatalogs({ staticEntry, lazyEntry })` receives that app's URLs and
substitutes only its client resolution. English stays static; Chinese becomes a
language chunk. SSR uses static catalogs. The root loader negotiates cookies and the
full weighted Accept-Language list per request. The client awaits
`preloadCatalog(document.documentElement.lang)` before hydration and retries a
failed preload once. This retains the same initial catalog and UTC formatting.
Concurrent SSR requests resolve preferences and the active locale independently.

After hydration, Web restores only `raypx_locale` and reads the complete browser
language list. Missing/invalid preferences mean system, denied reads retain the
loader snapshot and denied writes do not roll back the active session. Retired keys
are ignored without deletion or migration. Language events refresh system candidates.

Desktop and Mobile use static application catalogs. Desktop keeps the existing native
preference schema and atomic writes, passing a validated snapshot with
`restorePreference={false}`. Browser storage cannot override that snapshot. Host
writeback waits for `hydrated`, avoiding temporary defaults overwriting a native
preference. Logout preserves preferences and CLI profiles. Browser/renderer formatting
adopts device time after mount; server and hydration stay UTC. Mobile uses native
locale/appearance adapters without importing DOM entry points.

## Verification

Package-local tests cover typed TS and JSON bindings, shared context, form drafts,
retry, persistence, time zones, concurrent SSR and hydration. Tooling fixtures cover
JSON catalogs, their generated declarations and rejected malformed/conflicting/missing
catalogs. Build acceptance checks Web's lazy Chinese resource, Desktop's exclusion
of Web-only copy and Mobile's DOM-free composition; JSON fixtures exercise each
bundler. Run focused tests, `bun run i18n:check`, `bun run verify` and Web,
Desktop-renderer and Mobile export builds. Native device/GUI acceptance is separate.

The runtime is maintained in this repository.
See the [migration record](../development/i18n-intl-vendoring.md) for build and test results.
