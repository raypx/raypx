# Internationalization

`@raypx/i18n` owns static English/Chinese catalogs, device language preferences and
platform adapters. `@voidmix/intl` is an independently published SDK that bundles
`use-intl` for translation, formatting, React context and caches; Raypx does not
declare `use-intl` itself. Application
loaders own any future asynchronous message retrieval. Current catalogs stay
statically imported; there is no remote loading or localized routing in this design.

## Types and configuration

The locale runtime is the source of supported locale types and preference parsing.
The English catalog preserves literal strings for namespace, key, ICU argument
and rich tag inference. Chinese satisfies the recursive `CatalogShape` of English;
the catalog gate also checks ICU syntax, argument names and rich tag names.
Language controls are generated from the locale configuration and a complete
native-name map. Application code imports hooks through `@raypx/i18n` platform
entries. Dynamic keys are narrowed with domain types or explicit mappings.

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

The shared `LanguageProvider` is controlled by the platform owner and passes the
current locale and catalog directly to the SDK provider. It has no second locale
state or loader cache. Translation hooks use the nearest upstream provider.

### Web

The root loader resolves cookies and the complete weighted Accept-Language list.
HTML and the first hydration render consume the same snapshot. Only after
hydration does the browser read localStorage and `navigator.languages` (falling
back to `navigator.language` when the list is empty).

Browser restoration order is the new `raypx_locale` key, one-time migration from
`voidmix_locale`, the locale cookie, then system. An existing but invalid new key
selects system and cannot revive an old choice. Storage denial retains the loader
snapshot. Migration deletes the old key only after successfully writing the new
one; a write failure can still use the migrated preference for that session.

An explicit locale writes the cookie; system deletes it. Cookie-only preferences
are mirrored to storage. Cross-window events are accepted only for the target
localStorage area and preference key, including storage clear. Removal, clear or
invalid values select system and synchronize the cookie. Runtime resets never
rerun historical migration. `languagechange` refreshes the full candidate list.

### Desktop

The native preferences file keeps its existing schema and atomic writes. Preload
passes a snapshot directly to the renderer, distinguishing valid, missing and
failed reads. A valid file is authoritative. A missing file permits renderer
storage migration. An invalid or unreadable file starts from safe defaults.
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
source. See [Voidmix library changes](../development/intl-release.md).
