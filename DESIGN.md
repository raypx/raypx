---
name: Voidmix
description: A precise project workbench using shadcn Neutral across every surface.
---

# Voidmix visual system

The cloud product centers research conversations and reviewable Task deliveries. The roadmap in
[PRODUCT.md](PRODUCT.md) does not describe capabilities that the current UI can
promise. Product captures use labelled synthetic examples of actual routes.

## Foundation

Use shadcn `base-nova`, Base UI, Tailwind v4 and Phosphor. The official Neutral
light/dark theme is the baseline in
[globals.css](packages/ui/src/styles/globals.css). Do not add a page-specific
palette or recolor the Logo, favicon or native icons. Light primary actions are
black; dark primary actions are light. Errors use the stock destructive role.
Other business states use neutral badges, text and an appropriate icon.

Use stock component variants, radii, focus rings and sizes. Do not impose a
minimum height on every control or override component colors in page CSS.
Coarse-pointer targets are at least 44px. Forms use Field and InputGroup;
Base UI owns overlays, focus containment, dismissal and keyboard behavior.
Utility actions such as theme, language and window controls use compact icon
buttons with accessible names and hover hints. Keep descriptive copy out of
toolbars; primary business actions retain short, explicit text labels.
Use shared IconButton for hover/focus hints and HelpHint for explanations that
must open on click or touch. Group repeated unavailable notices into one short
status per section, with the reason available from its help control. Keep form
labels, errors, permissions and real data visible. Shorten marketing paragraphs
to one specific sentence instead of repeating the same capability.

Retain the Inter/system Chinese fallback stack without runtime font downloads.
Application headings are 24–28px, sections 18–20px, body 14px and metadata at
least 12px. Marketing headings are 38px on phones and up to 64px on desktop.
Align metadata and use tabular numerals for dates and numbers. Long names remain
accessible in the DOM and through title text when truncated visually.

## Page composition

- **Website:** a clear Search/Computer entry, concise capability descriptions and
  visible configuration states. Marketing links open actual docs and contact
  routes. Public metadata uses the selected locale and configured site origin.
- **Authentication:** a quiet product panel and an unboxed form capped at 360px,
  with a plain text account link below the primary action. Below 900px use one
  column and show the Logo above the form. Registration and reset follow API
  capabilities. Autofill uses the same Neutral surface as the input and its addon.
- **Web:** one 232px sidebar for conversations, tasks, projects, usage and Admin, a 56px context bar
  and content capped at 1400px. Below 1024px use an icon rail; below 768px use
  a Sheet with focus restoration. The Logo mark remains visible on icon rails.
- **Conversation:** a central answer and composer, source references and expandable
  execution details. Mobile places auxiliary information in tabs or drawers;
  preserve focus, input-method composition and manual scrolling.
- **Delivery:** file collections are reviewable revisions. Preview and download
  are authorized; accepting the current revision completes its Task.
- **Projects:** divider rows show name, description, stage, ownership and update
  date. Creation uses a Dialog. Details put tasks beside 288px of project
  information; that information moves above tasks on narrow screens.
- **Admin:** a compact header, filtered API total, filters and a table. Standard
  ToggleGroup, Checkbox and Table primitives retain page-scoped selection and
  batch feedback. Mobile rows preserve identity, selection and actions.
- **Desktop:** the same Neutral components, a collapsible 224px navigation rail,
  and an 800px native/renderer minimum. Settings group appearance, devices,
  local folders and preferences. No extra native permissions are introduced.

## State and interaction

Loaders own remote data and retain content during background refresh. URL search
owns filters and cursors. Admin Zustand remains page/account scoped. Forms and
overlays stay local; Desktop preferences retain migration and delayed hydration.

Distinguish initial empty, empty pagination, filtered-empty, permission failure,
request failure and unavailable capabilities. Errors retain drafts and offer
real retry actions. No fabricated data, no-op controls or claimed live activity.

Keep transitions short and purposeful. Reduced motion removes movement and
animation. Use semantic headings, labelled controls, visible focus, and sufficient
contrast. Keep secondary menus and Toast implementations lazy.

## Ownership and maintenance

Shared primitives belong in `packages/ui`; navigation and business composition
belong to their applications. There is one theme and no beUI runtime variant.
The previous [pilot](docs/development/beui-pilot.md) remains historical evidence.

Inspect shadcn upstream diffs before applying an update. Keep the button's safe
`type="button"` default, public prop types, localized Modal wrapper and lazy
Toast bridge. The generator manifest describes the installed component set;
review overwrites as documented in
[the UI workspace](packages/ui/AGENTS.md).

See [product design](docs/architecture/design.md) and
[visual verification](docs/development/neutral-ui.md).
