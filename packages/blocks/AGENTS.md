# @raypx/blocks

## Purpose

Application chrome shared by Web and Desktop: the sidebar shell and settings page
layout. Blocks composes UI primitives and i18n copy; applications supply routing,
feature views and product behavior.

## Interface

Each block is one `src/components/<name>.tsx` file with an explicit
`@raypx/blocks/<name>` export in package.json; add the export with the block.
Code outside `src/components/` stays private.

- `shell`: `AppShell` with skip link, brand, grouped navigation, account slot,
  breadcrumbs, notice slot and `#main`. `frame="document"` scrolls the page;
  `frame="window"` pins a native window, reserves the title-bar inset and scrolls main.
  Applications pass a `LinkComponent` adapting their router to `ShellLinkProps`;
  it sets `aria-current="page"` on active entries when `markActive` is true.
- `settings`: `SettingsPage`, `SettingsSection` (heading-labelled row with a control),
  and the device preference sections `AppearanceSettings` (needs UI's ThemeProvider)
  and `LanguageSettings` (needs i18n's BrowserLanguageProvider). LanguageSettings
  composes UI's shadcn Select with i18n's preference hook and locale options.
- `styles.css`: registers Blocks as a Tailwind source; applications import it.

## Constraints

- Depend only on UI, i18n and Lucide. Never import account, auth, tasks, analytics,
  a router or a remote client; take them as props or children.
- Add a block when at least two applications render the same composition.
  Single-application layouts stay in that application.
- Preserve keyboard focus, labelled landmarks, reduced motion and Chinese/English copy.

## Verification

Run `bun run --cwd packages/blocks check` and `bun run --cwd packages/blocks test`.
Web and Desktop route tests cover integration.
