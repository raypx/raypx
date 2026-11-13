# @raypx/i18n

Raypx's common English/Chinese copy, locale policy and runtime adapters live here.
Business packages own their catalogs and applications compose the namespaces they use.
This workspace alone declares and imports `use-intl`. The default catalog pins it
exactly and the lockfile resolves one version. Imports use the public
`use-intl/core` and `use-intl/react` entries. Other workspaces use the i18n package
entries and must not install use-intl, next-intl or FormatJS runtime packages.
Tooling uses a dedicated parser for static ICU checks. There is no generated catalog,
global message declaration or runtime namespace registration.

## Authoring catalogs

Use `locales/<language>/<namespace>.json` in the owning workspace, in every language.
Each file contains that namespace's nested string object, without a namespace wrapper.
Keep a handwritten `index.ts` in each language directory:

```ts
import common from "./common.json" with { type: "json" };
import example from "./example.json" with { type: "json" };

export default { common, example } as const;
```

TypeScript widens imported JSON values to `string`. `bun run i18n:types` writes
`<namespace>.d.json.ts` beside each English catalog with literal types, so call sites
keep exact keys, ICU argument types and rich-text callbacks. The file is ignored by
Git; `check` regenerates it, and you run the command yourself after editing English
copy when you want the editor to see the change immediately.

Reuse `common` for shared controls and status words; keep feature-specific guidance
in its owning namespace. Use ICU plural parameters for numeric variants and pass
numbers directly. Use `useFormatter().number(value, { style: "unit", unit: "minute",
unitDisplay: "long" })` for standalone units. UI primitives receive caller labels.

## Composing an application

Shared packages expose pure `/messages/en` and `/messages/zh` data entries.
Applications explicitly spread those entries and add their own private namespaces
in `locales/en/index.ts` and `zh/index.ts`. Namespace ownership is unique; use no
recursive merge. Infer the application type from its English entry:

```ts
import { createBrowserI18n } from "@raypx/i18n/browser";
import { messages } from "#messages";
import type en from "../locales/en/index.js";

export const { BrowserLanguageProvider, preloadCatalog, useTranslations } =
  createBrowserI18n<typeof en>(messages);
```

Create this binding once at module scope. A business package instead binds its
private hook with `createTranslations<M>()`, composing its required catalog types
through type-only imports. All bindings read the same underlying messages context;
`useLocale`, `useFormatter`, `useNow`, `useTimeZone` and
`useLanguagePreference` remain shared hooks from `/browser`. I18n never imports
business catalogs. Tests assemble their owning package's fixtures directly.

Web and Desktop each compose nine shared and five application-owned namespaces.
Mobile statically combines only `common` and `auth`, using the pure translator
without importing DOM adapters. Devtools keeps its own private bilingual dictionary.
See the [ownership table](../../docs/architecture/internationalization.md).

## Delivery and persistence

`createBrowserI18n<M>(sources)` accepts one static catalog or async loader per
language and returns the application provider, preload function and typed hook.
Desktop uses static sources. Web's private `#messages` alias points to its static
entry; `i18nCatalogs({ staticEntry, lazyEntry })` from `/vite` substitutes only
that application's client entry. SSR stays static. English is bundled and Chinese
loads as one language resource; no namespace-level loading is introduced.
Web awaits `preloadCatalog(document.documentElement.lang)` before hydration.
During a switch, the previous ready catalog stays visible while the next loads;
failed requests can retry on a later switch. Only an initial unavailable catalog
suspends, preserving mounted views and form drafts.

`useLanguagePreference().setPreference()` is the only language mutation API.
The preference is `system`, `en` or `zh`; resolution uses the full ordered
system language list. Browser restoration reads only `raypx_locale` after the
initial server snapshot. Missing or invalid values select system; denied reads
retain the snapshot and denied writes do not roll back the active selection.
Retired keys are ignored and left intact. Desktop passes its native snapshot with
`restorePreference={false}` and waits for `hydrated` before host writeback.
Server and hydration formatting use UTC; after mount the provider adopts the device
time zone. Use the `timestamp` dateTime preset for absolute times.

## Pure helpers

Root and `/types` expose locale negotiation, synchronous generic translation and
formatting without catalogs, React or platform dependencies. `/preferences` owns
pure preference parsing. `/messages/en` and `/messages/zh` contain only `common`.
Error translation uses typed key maps and an explicit fallback; diagnostic prose is
never product copy. Type a deliberately dynamic translator with `DynamicMessages`;
`MessageCatalog` describes recursive structure rather than opting out of key checks.

Run this package's `check` and `test`, `bun run i18n:check` and root `verify`.
