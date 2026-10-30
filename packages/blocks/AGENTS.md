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
  breadcrumbs, notice slot and `#main`. Both frames fill the viewport and scroll
  main independently of navigation and the top bar. `frame="document"` uses browser
  spacing; `frame="window"` reserves the native title-bar inset. Applications register
  `#main` with their router's scroll restoration/reset behavior.
  Applications pass a `LinkComponent` adapting their router to `ShellLinkProps`;
  it sets `aria-current="page"` on active entries when `markActive` is true.
  Optional `navigationLabels` label the main groups; `secondaryNavigation` stays
  above the account slot. Desktop-width users can toggle an icon rail, which narrow
  screens use automatically. Rail links retain names, badges and shadcn tooltips.
  The shell composes UI’s shadcn SidebarProvider, Sidebar, groups, menus and footer.
  It uses the persistent icon rail on narrow screens. The account slot adapts to
  `group/sidebar` and `data-collapsible="icon"`.
  Blocks owns the local `raypx_sidebar_open` device preference and cross-window
  storage subscription; the UI primitive owns no persistence. Missing/blocked
  storage keeps the expanded default or current in-memory choice. Narrow layouts
  still use the rail regardless of the stored desktop-width choice.
  `brand.description` adds a compact workspace subtitle. Applications can insert
  `contextNavigation` after the primary group and an `accountAction` beside the
  account menu; Blocks never loads project or account data itself.
  `layout` selects the page template that owns content width, gutters and vertical
  rhythm: `document` (reading width for settings, account and onboarding),
  `workbench` (wide list/detail workspaces) or `tool` (the whole main region).
  `#main` is the `main` container, so templates and page content query its width,
  which follows the sidebar, with `@…/main` variants instead of viewport breakpoints.
  Pages, feature views and their loading/error states never set their own outer
  width or gutters. `ShellPage<Title>` is the route metadata shape: applications
  declare `staticData.page` with a value-free message key, an optional `guestTitle`
  and the layout, and derive breadcrumbs and `layout` from the deepest match.
- `settings`: `SettingsPage` (header and sections inside a `document` template),
  `SettingsSection` (heading-labelled row with a control), and the device preference
  sections `AppearanceSettings` (needs UI's ThemeProvider) and `LanguageSettings`
  (needs i18n's BrowserLanguageProvider). LanguageSettings
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
