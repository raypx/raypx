# ui-storybook

## Purpose

Storybook preview of `@raypx/ui` primitives and patterns. This application is an
independent composition root and is never imported by another workspace.

## Interface

- `.storybook/main.ts` configures the React Vite framework, the a11y and docs addons
  and the Tailwind plugin. Storybook owns the Vite config; add only what UI styles need.
- `.storybook/preview.tsx` imports `src/styles.css`, wraps every story in the UI
  `ThemeProvider` (driven by the Theme toolbar, never persisted) and `TooltipProvider`.
- Stories live in `src/stories/*.stories.tsx`, titled `Primitives/*` for
  `components/ui` and `Patterns/*` for handwritten UI patterns.

## Constraints

- Import UI only through its public package exports; no private source paths.
- No account, auth, task or API behavior. Stories use static sample data only.
- Keep labelled controls, keyboard focus and Chinese/English sample copy so the
  a11y panel reflects real usage.
- `dist/` is build output. Telemetry is disabled.

## Verification

```sh
bun run --cwd apps/storybook check
bun run build:storybook
bun run dev:storybook
```
