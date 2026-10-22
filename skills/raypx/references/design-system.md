# Design system

Package: `@raypx/ui` ([AGENTS](../../../packages/ui/AGENTS.md)). Base UI + shadcn
primitives, Lucide icons, Tailwind 4 and Neutral light/dark tokens.

- Add a primitive: run `bunx shadcn@latest add <component>` inside `apps/web` (its
  `components.json` aliases `ui` to `@raypx/ui/components/ui`), adapt it to
  `#lib/utils` and record it in `packages/ui/shadcn-components.json`.
- Theme: edit `src/themes/tokens.ts`, then run `generate:theme`. `/themes/config` is
  pure (parsing, cookie reading, `themeMeta`); `/themes` has `ThemeScript` for the
  head, `ThemeProvider`, `useTheme` and a provider-aware `ThemePicker`. The script and
  provider own the `theme-color` meta; never render it through React.
- Destructive text on a `destructive/*` tint uses `text-destructive-text` (AA in light mode).
- Shared app chrome (sidebar shell, settings page sections) lives in `@raypx/blocks`;
  preview UI primitives with `bun run dev:storybook`.
- Apps import `@raypx/ui/styles/app.css`; feature packages export their own
  `/client/styles.css` to register Tailwind sources.
- Keep the original logo, labelled controls, keyboard focus and reduced motion.
  No Radix and no other icon library.
