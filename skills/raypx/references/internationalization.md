# Internationalization

Package: `@raypx/i18n` ([AGENTS](../../../packages/i18n/AGENTS.md)) wiring product catalogs
into `@raypx-kit/intl`. Design: [internationalization](../../../docs/architecture/internationalization.md).

- Locales: English and Chinese; preference is `system`, `en` or `zh`, stored per device.
- Add every key to both `src/messages/en.ts` and `zh.ts`, then `bun run i18n:check`.
- `useLanguagePreference().setPreference()` is the only way to change language.
- Web SSR renders with the cookie/Accept-Language snapshot, then restores device storage.
- Translate safe error codes; never show server diagnostic prose.
- Change provider or storage behavior in Raypx Kit, not here.
