# @raypx/ui

## Purpose

Shared visual primitives and Neutral design tokens. Applications and feature
packages own page layout, forms, navigation and product behavior.

## Interface

- `components/ui/*`: Base UI and shadcn primitives.
- `components/ui/sidebar`: shadcn base-nova Sidebar composition and context.
  SidebarProvider supports a persistent mobile rail via `mobileBehavior="rail"`;
  the default is a Sheet. Callers supply translated trigger labels and own persistence.
  Style icon-only sidebar content with the `sidebar-icon:` Tailwind variant from
  `styles/globals.css`: it matches a user-collapsed sidebar and, for rails, the
  `useIsMobile` media query, so server HTML paints the narrow rail before hydration.
  The keyboard shortcut ignores text editors.
- `themes`: all dark/light behavior in `src/themes`. Render `ThemeScript` in the
  document head (optional `initialThemeSource` expression for native snapshots),
  wrap the app in `ThemeProvider` (`initialTheme`, `storageKey`), read `useTheme`,
  and render `ThemePicker` with labels; it follows the provider unless controlled.
  `readStoredTheme`/`storeTheme` read and write the browser mirror outside React.
  Also re-exports the pure helpers below.
- `themes/config`: universal tokens, types, `THEME_STORAGE_KEY`, `parseTheme`,
  `readThemeCookie`, `themeColors` and `themeMeta` (spread into root head meta).
  Never render `theme-color` through React: the script inserts it and the provider
  updates it, because React 19 hydrates head meta by content and would duplicate it.
- `styles.css`: DOM Tailwind entry and generated theme values.
- `styles/app.css`: imports the Tailwind entry once and supplies layered app base
  defaults. Layout and control utilities live in their owning components.
- Other explicit subpaths expose reusable visual patterns and the original logo.
- `logo-mark.webp` exposes the unchanged brand asset for browser and build-tool use.
- `select-field` composes the shadcn Select for labelled string options, including
  disabled options, placeholders and named form values. Prefer it to NativeSelect
  in feature UI so popup appearance and keyboard behavior are shared.
- `confirmation` exposes useConfirmation for asynchronous shadcn confirmation
  dialogs. Render its dialog, await confirm, and retain mutation fences after the
  answer. Escape and dismissal cancel the active request; distinct requests queue, explicit requestKey identities share a promise, and unmount cancels every pending request.

## Ownership

Own accessibility, semantic color roles, focus, radius and reduced motion.
Preserve the original brand artwork and Neutral light/dark values.
Destructive text on a `destructive/*` tint uses `text-destructive-text`, a darker light-mode
red that keeps WCAG AA; `destructive` stays the fill and border color.

## Constraints

- No account, file, task or API behavior in this package.
- No DOM imports in `themes/config`, `tokens.ts` or `script.ts`.
- Edit `src/themes/tokens.ts`, then run `generate:theme`; the generated DOM CSS
  must stay identical to that source.
- Use Base UI and Lucide icons; do not introduce Radix or another icon library.
- Generated shadcn primitives live under `src/components/ui`; handwritten patterns
  stay flat under `src`. Consumers use explicit package exports.
- App `components.json` files alias `ui` to `@raypx/ui/components/ui`, so
  `shadcn add` from an app writes here. Adapt new primitives to `#lib/utils` and
  record them in `shadcn-components.json`.
- Preserve labelled controls, keyboard/focus behavior and reduced-motion support.
- Prefer Tailwind utilities and semantic tokens; keep global app rules in the
  base layer so component utilities can override defaults.
- Keep an independent Vitest config so Vite application plugins never enter tests.

Component suites live under `tests/component/`, grouped by feature when needed.
Keep shared test setup in `tests/setup.ts`.

## Verification

```sh
bun run --cwd packages/ui generate:theme
bun run --cwd packages/ui check
bun run --cwd packages/ui test
```
