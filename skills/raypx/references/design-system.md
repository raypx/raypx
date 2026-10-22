# Design system

Package: `@raypx/ui` ([AGENTS](../../../packages/ui/AGENTS.md)). Base UI + shadcn
primitives, Lucide icons, Tailwind 4 and Neutral light/dark tokens.

- Add a primitive: run `bunx shadcn@latest add <component>` inside `apps/web` (its
  `components.json` aliases `ui` to `@raypx/ui/components/ui`), adapt it to
  `#lib/utils` and record it in `packages/ui/shadcn-components.json`.
- Theme: edit `src/theme/tokens.ts`, then run `generate:theme`. `/theme` is pure;
  `/theme/client` has the provider, startup script and `ThemePicker`.
- Apps import `@raypx/ui/styles/app.css`; feature packages export their own
  `/client/styles.css` to register Tailwind sources.
- Keep the original logo, labelled controls, keyboard focus and reduced motion.
  No Radix and no other icon library.
