# ADR-0007: Web locale catalogs load by locale

## Status

Accepted

## Context

The Web application owns its translation catalogs and currently supports English
and Chinese. Sending both catalogs in the initial browser preload is avoidable,
while the server still needs the negotiated locale before rendering to keep the
document, translations, and hydration output consistent. Desktop and Mail have
different runtime constraints and do not need this browser split.

## Decision

Web resolves the locale in the root server loader and loads only that locale's
JSON catalog before SSR. The catalog is returned with the root preferences and
passed to `AsyncI18nProvider`. Web owns an explicit, type-checked
locale-to-dynamic-import map for subsequent switches.

`AsyncI18nProvider` is additive to the existing synchronous `I18nProvider`. It
keeps the current locale and catalog visible while a target catalog loads,
caches each locale's Promise so concurrent requests share one load, commits the
locale and catalog atomically after success, ignores stale switch results, and
clears a rejected Promise so a later switch can retry. Storage and the optional
document synchronization callback run only after a successful current request;
storage and callback failures are isolated so an otherwise valid in-memory
switch still commits. Effect cleanup is replay-safe under React StrictMode.

Catalogs remain JSON files. No namespace splitting, generated loader, package,
cache-header, or deployment change is part of this decision. Recovery pages keep
their independent static messages.

## Consequences

- The Web home route does not preload the non-current locale catalog.
- A language switch waits for one asynchronous catalog import and keeps old copy
  visible during the wait.
- Catalog load failures do not block the application and can be retried.
- SSR includes the current catalog in loader data, so the first render does not
  suspend or hydrate against an empty catalog.
- Desktop, Mail, and the synchronous provider retain their existing behavior.

## Follow-up

Reconsider namespace-level splitting when there are at least three supported
languages or when the non-current locale adds at least 10 KiB gzip to the Web
home route's initial preload.
