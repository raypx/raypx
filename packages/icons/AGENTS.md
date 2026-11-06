# @raypx/icons

## Purpose

Shared React SVG icons for Web, Desktop, UI and feature views. Own the selected
Hugeicons Free glyphs, decorative defaults and consistent sizing/stroke behavior.

## Interface

- Each explicit `/<name>` export exposes one named `<NameIcon />` component.
- Root exports only `IconProps` and `IconComponent` types.
- `/styles.css` registers Tailwind sources; UI imports it once for every DOM app.
- Defaults are 24px, currentColor and 1.75 stroke. CSS sizing and stroke utilities,
  explicit SVG props and React 19 refs pass through. Unlabelled icons are decorative.

## Constraints

- Only this package imports Hugeicons. Use the free MIT Stroke Rounded collection.
- Add a glyph when a real consumer needs it, via a static public glyph subpath import and
  an explicit package export. Keep the factory private and preserve tree shaking.
- This is a browser library. No UI, theme, routing, account or application imports;
  no native renderer or universal entry until an actual consumer needs one.
- Keep all glyph geometry in the upstream icon data. Do not redraw brand artwork.
- Unit tests stay beside source; DOM suites use `*.component.test.tsx`.

## Verification

Run `bun run --cwd packages/icons check` and `test`, then `bun run verify`.
Browser checks cover inherited stroke widths with the compiled Tailwind utilities.
