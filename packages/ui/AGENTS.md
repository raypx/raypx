# @raypx/ui

## Purpose

Shared visual primitives and Neutral design tokens. Applications and feature
packages own page layout, forms, navigation and product behavior.

## Interface

- `components/ui/*`: Base UI and shadcn primitives.
- `theme`: pure token definitions, types and theme preference parsing.
- `theme/client`: DOM provider, startup script, theme hook and controlled ThemePicker.
- `styles.css`: DOM Tailwind entry and generated theme values.
- `styles/app.css`: imports the Tailwind entry once and supplies layered app base
  defaults. Layout and control utilities live in their owning components.
- `styles/native.css`: generated semantic variables for Uniwind only.
- Other explicit subpaths expose reusable visual patterns and the original logo.

## Ownership

Own accessibility, semantic color roles, focus, radius and reduced motion.
Preserve the original brand artwork and Neutral light/dark values.

## Constraints

- No account, file, task or API behavior in this package.
- No DOM imports in the pure theme or native CSS entry.
- Edit `src/theme/tokens.ts`, then run `generate:theme`; generated DOM and native
  CSS must stay identical to that source.
- Mobile uses native semantic CSS and Uniwind, without the DOM ThemeProvider.
- Use Base UI and Lucide icons; do not introduce Radix or another icon library.
- Generated shadcn primitives live under `src/components/ui`; handwritten patterns
  stay flat under `src`. Consumers use explicit package exports.
- Preserve labelled controls, keyboard/focus behavior and reduced-motion support.
- Prefer Tailwind utilities and semantic tokens; keep global app rules in the
  base layer so component utilities can override defaults.
- Keep an independent Vitest config so Vite application plugins never enter tests.

## Verification

```sh
bun run --cwd packages/ui generate:theme
bun run --cwd packages/ui check
bun run --cwd packages/ui test
```
