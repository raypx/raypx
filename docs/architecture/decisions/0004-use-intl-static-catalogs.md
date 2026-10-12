# ADR-0004: `use-intl` facade with static catalogs

## Status

Web catalog loading is superseded by ADR-0007; the recipient-locale clause is
superseded by ADR-0005. The remaining static-provider and facade decisions stay
accepted.

## Context

Voidmix needs one translation model across the server-rendered Web app, the
Tauri renderer, API errors, and authentication email. The app also needs stable
SSR/hydration output: translation lookup must not introduce a Promise or a
late catalog swap during the first render.

## Decision

`@voidmix/i18n` is the only translation facade exposed to business code. It
owns locale normalization, Accept-Language parsing, Cookie and localStorage
adapters, locale state, formatting helpers, and the React/server integration.
`use-intl` is an implementation dependency of that package; applications and
Mail do not import it directly or augment its global `AppConfig` type.

Web, Desktop, and Mail own their English and Chinese `messages/*.json` files.
Desktop statically imports both catalogs and mounts them through the shared
`I18nProvider`. Components select a namespace with
`useTranslations("namespace")`. Mail creates a synchronous translator from
the same static catalogs through `@voidmix/i18n/server`. Web's catalog loading
is defined by ADR-0007.

Web resolves the unprefixed `locale` Cookie, then `Accept-Language`, then `en`,
and persists changes in a one-year SameSite=Lax Cookie. Desktop resolves
`localStorage.voidmix_locale`, then `navigator.language`, then `en`. The shared
locale provider updates its in-memory state and storage before invoking the
document synchronization callback, so a callback failure cannot leave the UI
and persisted locale out of sync. Web renders the document `lang` attribute
from `useLocale()`; Desktop starts with the deterministic English build shell,
then reads its preference during hydration and synchronizes the document after
each switch.

Formatting uses the same `use-intl/core` formatter path for server and client
helpers. The default timezone is `UTC` for deterministic SSR/hydration output;
callers can request an explicit timezone or format definitions through
`createFormatter` or the provider. Formatter instances are cached by locale,
timezone, and effective format definitions.

API boundaries return a stable transport code and a `data.error` envelope with
the localizable detail code and optional primitive interpolation values;
diagnostic messages remain server-side. Web and Desktop translate that envelope
from their local `errors` namespace. `@voidmix/core` and `@voidmix/contracts`
define the value shape but do not depend on i18n.

Mail uses `input.locale` when supplied, otherwise `MAIL_DEFAULT_LOCALE`,
falling back to `en`. Subject, preview, HTML, text, actions, and the HTML
`lang` attribute use the same resolved locale.

## Consequences

- Static catalogs eliminate i18n Suspense and translation content jumps during
  SSR, hydration, and locale changes.
- Desktop and Mail continue to bundle their supported catalogs statically. Web
  accepts the extra async switching state in exchange for keeping the non-current
  locale out of the initial browser preload.
- Catalog drift and source boundaries are checked by `bun run i18n:check` (also
  the first gate in `bun run verify`). The check compares recursive leaf keys,
  node types, and ICU argument names in every Web/Desktop/Mail catalog pair,
  and reports direct `use-intl` imports, missing surface facades, likely
  hardcoded UI copy, and hardcoded formatting locales.
- Root recovery pages keep their independent static copy so they remain
  renderable when an application chunk fails.

## Follow-up

Web per-locale splitting is specified by ADR-0007. Namespace splitting remains
deferred until deployment or bundle measurements show that per-locale splitting
is no longer sufficient.
