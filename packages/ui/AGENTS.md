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
- Other explicit subpaths expose reusable visual patterns and the original logo.

## Ownership

Own accessibility, semantic color roles, focus, radius and reduced motion.
Preserve the original brand artwork and Neutral light/dark values.

## Constraints

- No account, file, task or API behavior in this package.
- No DOM imports in the pure theme entry.
- Edit `src/theme/tokens.ts`, then run `generate:theme`; the generated DOM CSS
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
