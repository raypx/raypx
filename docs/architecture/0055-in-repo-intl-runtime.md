# ADR 0055: In-repository internationalization runtime

Date: 2026-11-12

Status: Accepted. Supersedes the former external Intl SDK dependency recorded in
[ADR 0043](0043-package-surfaces.md).

## Context

The independently released `@raypx-kit/intl` bundled use-intl and FormatJS.
Bundling kept its React provider and translation hooks on one copy of the engine,
but product changes required linking the SDK, publishing a snapshot and updating
Raypx's catalog. Raypx is the only consumer of the runtime adapters in this repository.

## Decision

`@raypx/i18n` maintains the adapters here, starting from the SDK release
`@raypx-kit/intl@0.0.0-alpha.2` at Raypx Kit commit
`b928c371393a14b5bdf8d6e9a075fef66eff32ce`. It is the sole workspace declaring
`use-intl`. The default catalog pins `4.14.9` and the lockfile resolves one copy.
All runtime translation imports use the public `use-intl/core` or `use-intl/react`
entry inside the workspace. A single declaration and lockfile resolution let all
typed bindings read the same mounted messages context. Other workspaces use the
existing i18n entries and do not install use-intl, next-intl or FormatJS runtime
packages.

Business packages own their catalogs, applications compose them and i18n owns common
messages, locale policy and preference state. Browser preference changes go through
`useLanguagePreference().setPreference()`. The pure entry remains available to
Mobile, while the browser entry owns DOM persistence and hydration.

Tooling owns static ICU catalog comparison. It uses the ICU message parser from
the dev catalog and reads i18n's static policy without depending on the i18n runtime.

## Verification

The i18n workspace tests the shared provider context, typed catalog bindings and
server-to-client preference reconciliation. Web builds keep a static English
catalog and a separate Chinese resource. Mobile exports use the core entry
without bundling DOM code. See the [migration record](../development/i18n-intl-vendoring.md).
