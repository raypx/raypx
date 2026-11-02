# Shared Hugeicons

`@raypx/icons` owns Raypx's React SVG icons. Web, Desktop, Storybook, UI and shared
feature views consume this private browser library. It uses Hugeicons Free's MIT
Stroke Rounded collection and leaves the original Raypx brand artwork in UI.

## Public entries

Import a component from its explicit entry. The package root exports types only;
there is no icon registry or runtime barrel that loads the entire collection.

```tsx
import { SearchIcon } from "@raypx/icons/search";
import { ScheduleIcon } from "@raypx/icons/schedule";
import type { IconComponent, IconProps } from "@raypx/icons";
```

Components accept SVG props, React 19 refs, `size`, `strokeWidth` and
`absoluteStrokeWidth`. Defaults are 24px, `currentColor` and 1.75 strokes. Controls
continue to size child SVGs; outside a control, use the existing Tailwind size
utilities. Existing explicit 1, 1.5 and 2.5 stroke overrides remain valid.

Unlabelled icons default to `aria-hidden`. `aria-label` or `aria-labelledby` makes
a glyph available to assistive technology unless the caller explicitly hides it.
Icon-only actions still use UI's labelled `IconButton`, whose tooltip and
accessible name describe the action. Icons never replace permission or error text.

The private renderer makes child paths inherit the root stroke width. Hugeicons
otherwise places its own stroke width on each path, which would prevent the
sidebar and account menu's `stroke-[1.75]` utilities from controlling the glyph.
UI imports `@raypx/icons/styles.css` once to register these Tailwind utilities.
There are no theme values, UI controls or business behaviors in Icons.

## Selecting and adding a glyph

1. Choose a free glyph for a concrete consumer. Verify the actual drawing at
   16px and 20px on both themes; upstream alias names can map to a different idea.
2. Add one `src/icons/<name>.ts` module with a public Hugeicons glyph subpath import and
   the private `createIcon` factory. Add its explicit `package.json` export.
3. Give the component a meaning-oriented `NameIcon` name. Consumers declare
   `@raypx/icons: workspace:*` and import its public entry.
4. Run Icons' check/test and repository verify. Inspect the actual control with
   keyboard focus, tooltip/accessible name, collapsed rail and reduced motion.

The initial migration has 69 selected components for the 70 distinct Lucide
glyphs previously used in 57 source files. Both pen/edit affordances use
`EditIcon`. The selected `CalendarClockIcon`, line arrows, `SentIcon`,
`HistoryIcon`, `PaletteIcon` and `SunMoonIcon` retain the intended meanings rather
than accepting the free package's approximate Lucide-name aliases.

Keep vendor imports and vendor runtime dependencies inside Icons. Do not export
the entire Hugeicons catalog, introduce string lookups, provide legacy aliases,
or add a native renderer without a real native consumer. The dependency direction
is Icons → Hugeicons/React, UI → Icons, then Blocks/features/apps → UI and Icons.
Only browser entries of mixed feature packages may import these components.

## shadcn generation

UI, Web and Desktop use `iconLibrary: hugeicons` in `components.json`. After
`shadcn add`, adapt generated Hugeicons imports to the matching
`@raypx/icons/<name>` component and keep vendor dependencies in Icons. This
preserves one renderer and one selected vocabulary across primitives and features.
Do not overwrite existing primitives merely to switch icon libraries.

## Verification and package size

```sh
bun run --cwd packages/icons check
bun run --cwd packages/icons test
bun run verify
```

Meaningful component tests cover SVG refs, updated size/stroke/accessibility props
and decorative icons inside labelled controls. Browser checks cover the compiled
CSS's inherited stroke width and the actual application surfaces. Renderer builds
do not imply packaged macOS/Windows or native mobile acceptance.

The earlier baseline experiment used Lucide 1.65.0 and Hugeicons Free 4.4.0 with
renderer 1.1.10. A Vite+/Rolldown ES-library bundle of all 70 candidate glyphs was
7,796 B gzip versus 13,658 B gzip, with React external. This isolated measurement
is not a route-size delta and predates the final curated mapping and shared
renderer. Source/package changes need actual application build checks.

See the [Hugeicons React guide](https://hugeicons.com/docs/integrations/react/quick-start)
and [free/Pro licensing](https://hugeicons.com/docs/faqs/license-questions). Only
the free MIT collection is used; Pro assets and license keys are not required.

## Migration validation (2026-11-02)

All source checks and tests, production Web/Desktop renderer builds and
`bun run verify` passed on raypx-tokyo. Verify completed 71 tasks, including the
Linux Go checks/tests after installing the pinned Go 1.27.3 toolchain. This does
not establish packaged macOS/Windows or native mobile acceptance.

Browser probes passed for compiled stroke inheritance, light/dark rendering,
390px settings, the password visibility button and Desktop renderer settings.
The shared browser fixtures supply the API's role projection with the matching
account ID. Guest access remains the default. The previously failing sidebar and
account-navigation cases now pass, along with their related navigation/settings
regressions. The complete compiled browser suite passes 32 cases; the 2 cases
requiring real backend or packaged live-Agent environments remain skipped.
Generated logs, probe results and screenshots are in `.artifacts/icon-evaluation/`.
