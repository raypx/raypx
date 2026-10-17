# @raypx/i18n

Raypx's product configuration around `@voidmix/intl`, which bundles `use-intl`. The package owns
English/Chinese catalogs, native language names and the product storage key. The
controlled language provider, browser preference adapters and safe error-code
translation are `@voidmix/intl` features configured here.

## Controlled rendering

`IntlProvider` receives a supported `locale` and one current `messages` catalog.
`useTranslations(namespace)` preserves catalog key and ICU argument types;
`useLocale`, `useFormatter`, `useNow`, `useTimeZone` and `useMessages` read the mounted
provider. The product default time zone is UTC. Applications may override it.

`useLanguagePreference()` is the only language mutation API. Its `preference` is
`system`, `en` or `zh`; the active locale is derived from the full ordered system
language list. Selecting a fixed language records that choice even if it is already
the currently resolved language. Catalogs are static and switches require no loading.

`LanguageProvider` from `/native` is controlled by `preference`, `systemLocales` and
`onPreferenceChange`. Native applications hydrate storage before mounting it.

## Browser and desktop

`BrowserLanguageProvider` from `/browser` accepts `initialPreference` and
`initialSystemLocales`. Server rendering and the first client render use only this
snapshot. After hydration the adapter restores `raypx_locale`, then the legacy
`voidmix_locale` value when the new key is absent, then the locale cookie, then system.
An invalid explicit new key selects system. A failed storage read keeps the initial
snapshot. Successful legacy migration writes the new value before removing the old
key; a failed write keeps the old value available.

Fixed choices are mirrored to a server-visible cookie. System clears that cookie.
The provider follows complete `navigator.languages` lists and localStorage
set/remove/clear events from other documents, ignoring sessionStorage. Persistence
failures do not prevent in-memory switching.
Deletion, clear and invalid storage events write a best-effort `system` reset marker
so surviving legacy values cannot return after remount. If writes are blocked, the
reset still applies in memory but cannot be guaranteed across a later mount.

Desktop passes its validated native snapshot with `restorePreference={false}`.
This disables browser restoration and storage-event overrides while retaining system
language changes and user choices. `useLanguagePreference().hydrated` becomes true
after browser environment reconciliation, so the host can gate writeback.
`readBrowserPreference()` restores/migrates device storage without inheriting cookies
when Desktop needs to bootstrap a missing native preference file.

## Pure helpers

The root entry exports locale matching, request negotiation, synchronous generic
translation and `createFormatter({locale, ...options})`. Product locale metadata is
derived from `SUPPORTED_LOCALES` and its checked native-name map. `/preferences` exports the pure preference parser
and full-list resolver; it imports no browser or native storage APIs.

Error translation helpers bind map/fallback keys to the supplied typed translator.
`translateErrorCode` requires an explicit fallback key. A single bridge connects
sanitized transport interpolation values to the translator; diagnostic prose is
never translated as product copy.

Keep static message literals for key and ICU argument inference. When a synchronous
translator consumes a dynamic catalog, explicitly type it as
`DynamicMessages` from the root or `/types` entry. `MessageCatalog` describes
recursive catalog structure for validation; it is not the opt-in dynamic translator
type.
