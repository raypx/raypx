# ADR 0050: Independent Mobile React

Status: Accepted, 2026-11-10. Supersedes the cross-application React pin in ADR 0034.

## Context

The Expo application currently provides an account/login baseline. Locking every
DOM application to Expo's exact React version couples unrelated release schedules
before native task views have an established delivery date.

## Decision

Mobile pins React and its types in `catalog:mobile` at versions supported by its
installed Expo SDK. The default catalog pins React and React DOM together for DOM
applications. Both catalogs currently resolve React 19.3.0, but their upgrades are
independent. Shared framework-neutral hooks declare peer ranges supporting both.

Metro resolves `react` and every `react/*` subpath from Mobile's own dependency,
including imports originating in shared workspace sources. Shared packages' DOM
test dependencies must never create a second React instance in a native bundle.
DOM bundlers retain their existing deduplication.

## Consequences

Mobile remains an active login/account application. Expo dependency alignment and
native bundle exports are checked separately from DOM tests. This does not claim
iOS/Android device acceptance or change the task/push roadmap.
