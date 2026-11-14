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
  spacing; `frame="window"` uses a full-width draggable title bar with MyGo's insets
  for the native window buttons. Logo, search and sidebar toggle share that strip;
  the sidebar omits its duplicate brand row and starts below it. Applications register
  `#main` with their router's scroll restoration/reset behavior.
  Applications pass a `LinkComponent` adapting their router to `ShellLinkProps`;
  it sets `aria-current="page"` on active entries when `markActive` is true.
  Optional `navigationLabels` label the main groups; `secondaryNavigation` stays
  above the account slot. Desktop-width users can toggle an icon rail, which narrow
  screens use automatically. Rail links retain names, badges and shadcn tooltips.
  The shell composes UI’s shadcn SidebarProvider, Sidebar, groups, menus and footer.
  It uses the persistent icon rail on narrow screens. The account slot adapts with
  UI's `sidebar-icon:` variant.
  Blocks owns the local `raypx_sidebar_open` device preference and cross-window
  storage subscription; the UI primitive owns no persistence. Missing/blocked
  storage keeps the expanded default or current in-memory choice. Narrow layouts
  still use the rail regardless of the stored desktop-width choice; navigation uses
  UI's `sidebar-icon:` variant so the rail paints before hydration.
  `brand.description` adds a compact workspace subtitle. Applications can insert
  `contextNavigation` after the primary group and an `accountAction` beside the
  account menu; Blocks never loads project or account data itself.
  `ShellToolbar` (start) and `ShellActions` (end) portal page context, tabs, actions and
  scope switches into the top bar; a start toolbar replaces the page title. Outside an
  AppShell they render inline, so isolated views and tests keep their controls.
  `ShellPrimaryAction` places a quiet New action below the compact brand/search header.
  `ShellSidebarNavigation` mounts feature shortcuts before application destinations;
  `ShellSidebarDirectory` mounts the sole Agent/group/Space/recent directory below them.
  `ShellSidebarFooter` keeps role/invitation controls beneath the pinned account row.
  `ShellSidebarHeader` remains the optional scope header slot for existing compositions.
  `useShellSidebarCollapsed` lets directory sections preserve rail access while folded.
  Applications and features own their data, accessible names and collapsed-rail content.
  `ShellProjectToolbar` groups a project and optional computer label with the
  application's tool links and back action. The application owns link selection.
  `layout` selects the page template that owns content width, gutters and vertical
  rhythm: `document` (reading width for settings, account and onboarding),
  `workbench` (wide list/detail workspaces) or `tool` (a full-height flex column in the main region).
  The content column (top bar, notices and `#main`) is the `main` container: page
  content and notices use `@…/main` variants, which follow the sidebar, while viewport
  variants stay with shell chrome such as the sidebar and top bar.
  Pages, feature views and their loading/error states never set their own outer
  width or gutters. `ShellPage<Title>` is the route metadata shape: applications
  declare `staticData.page` with a value-free message key, an optional `guestTitle`
  and the layout, and derive breadcrumbs and `layout` from the deepest match.
  `actions` adds compact commands beside the brand in both frames (`ShellAction`: a link element or button, with optional primary emphasis
  and a shortcut hint).
- `command-palette`: `CommandPalette`, a ⌘K / Ctrl+K dialog over host-supplied groups,
  and `useCommandShortcut` for the platform's key hint. The host owns the open state.
- `settings`: `SettingsPage` (header and sections inside a `document` template),
  `SettingsSection` (heading-labelled row with a control and optional icon), and the device preference
  sections `AppearanceSettings` (needs UI's ThemeProvider) and `LanguageSettings`
  (needs i18n's BrowserLanguageProvider). LanguageSettings
  composes UI's shadcn Select with i18n's preference hook and locale options.
- `preference-controls`: `ThemeToggle` and `LanguageMenu` for public headers.
  Use the surrounding theme and language providers. Applications place the
  controls and own preference persistence. Both language controls show catalog
  loading feedback and retry the selected language through the shared preference hook.
- `markdown`: `ReplyMarkdown` renders untrusted replies for Agents and Tasks in both
  applications. Callers supply translated copy labels. Raw HTML, executable URLs
  and remote images stay inert; fenced code has a copy/manual-selection control.
- `styles.css`: registers Blocks as a Tailwind source; applications import it.

## Constraints

- Workspace dependencies stay with UI, i18n and Icons. Never import account, auth, tasks, analytics,
  a router or a remote client; take them as props or children.
- Add a block when at least two applications render the same composition.
  Single-application layouts stay in that application.
- Preserve keyboard focus, labelled landmarks, reduced motion and Chinese/English copy.

## Verification

Run `bun run --cwd packages/blocks check` and `bun run --cwd packages/blocks test`.
Web and Desktop route tests cover integration.

## Catalog ownership

Own `settings` in `locales/<language>/`, with handwritten language entries
and pure `/messages/en` and `/messages/zh` exports. Support TS literal objects or
JSON nested strings, one format per namespace/language. Bind private translation
hooks through type-only catalog imports; applications supply the shared provider.
