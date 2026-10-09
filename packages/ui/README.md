# @raypx/ui

Browser-safe React presentation components based on the official shadcn/ui **new-york Radix** registry. UI owns appearance and accessible interaction. Requests, environment access, authentication, routing, and application state belong to its consumers. React and React DOM are peers.

## Public imports

Use individual component entries for application imports:

```tsx
import { Button } from "@raypx/ui/components/button";
import { Input } from "@raypx/ui/components/input";
import { Field, FieldLabel, FieldDescription, FieldError } from "@raypx/ui/components/field";
import { ErrorState } from "@raypx/ui/components/error-state";
import { Toaster, toast } from "@raypx/ui/components/sonner";
import { cn } from "@raypx/ui/utils";
```

The explicit `@raypx/ui/components` entry aggregates the same exports. The existing root entry keeps `Button`, `buttonVariants`, `ConnectionStatus`, and `cn` compatible. Do not import another package's `src` or `dist` directly.

Available component entries: `button`, `input`, `textarea`, `field`, `label`, `select`, `checkbox`, `switch`, `alert`, `badge`, `skeleton`, `progress`, `sonner`, `dialog`, `alert-dialog`, `separator`, `empty-state`, `error-state`, `loading-state`, and `connection-status`.

## Styling and themes

The UI build copies `styles.css` as **CSS source**; it does not compile Tailwind. The consuming web application owns Tailwind v4 compilation and content discovery:

```css
/* apps/web/src/styles.css */
@import "tailwindcss";
@import "tw-animate-css";
@import "@raypx/ui/styles.css";
@source "../../../packages/ui/src";
```

Import the application's compiled stylesheet in its root route. Do not load the UI theme as an independent CSS URL, because that bypasses Tailwind's theme and utility processing.

Tokens preserve system fonts and a teal focus/primary color. `.dark` switches the semantic palette. The application owns theme persistence and SSR initialization; this package does not read local storage or modify the document. Pass the application's resolved theme to `<Toaster theme={theme} />` and mount one toaster in its root. `system` is the default when no theme is supplied. Shared tokens include semantic stacking levels and reduced-motion rules.

The light text/placeholder contrast is above 6:1 against the page background; dark text/placeholder contrast is above 8:1. Focus and active input boundaries meet 3:1. Recheck contrast when overriding tokens.

## Composition and accessibility

`Button` defaults to `type="button"`; forms must opt into `type="submit"`. `asChild` retains the child element's semantics, so a link remains a link.

```tsx
<Field data-invalid={Boolean(error)}>
  <FieldLabel htmlFor="workspace-name">Workspace name</FieldLabel>
  <Input
    id="workspace-name"
    aria-invalid={Boolean(error)}
    aria-describedby={error ? "workspace-name-error" : "workspace-name-help"}
  />
  <FieldDescription id="workspace-name-help">Shown in your project list.</FieldDescription>
  <FieldError id="workspace-name-error">{error}</FieldError>
</Field>
```

Import `FieldError` with the other field components. Labels require matching `htmlFor`/`id`, descriptions and errors require explicit `aria-describedby`, and invalid controls require `aria-invalid`. `FieldError` omits empty errors and deduplicates repeated messages.

Radix handles Select keyboard navigation, Dialog focus trapping/dismissal/restoration, and AlertDialog's safe initial focus. Every dialog needs a title and description. Use a dialog for a focused action and an alert dialog to confirm a destructive action. Icon-only buttons require a caller-supplied accessible label.

`EmptyState` and `ErrorState` accept `title`, `description`, and an optional `action` React node. They do not initiate retries. `LoadingState` announces its label once while hiding decorative skeletons from assistive technology. `Progress` supports custom maximums, normalizes numeric bounds, and uses `null` for indeterminate progress.

The web application's `UIShowcase` is a local-only example of forms, dialogs, feedback, and states. It performs no requests.

## Storybook

Storybook is the UI development and reference workspace. It reads this package's
source directly, so component and theme changes update without rebuilding `dist`.
It uses the same Tailwind v4 tokens and shadcn components as the application, with
Autodocs, editable Controls, light/dark themes, and accessibility checks.

```bash
# Start the component explorer at http://127.0.0.1:6006.
bun run storybook

# Build a standalone static site into packages/ui/storybook-static.
bun run storybook:build

# Install Chromium once for browser tests, then render and test every story.
bun run storybook:install
bun run storybook:test
```

Stories are grouped into `Primitives`, `Forms`, `Feedback`, and `Overlays`. They
include variants, disabled and invalid inputs, controlled values, empty/error/loading
states, keyboard selection, dialog focus and dismissal, and toast actions. Preview
theme classes apply to the iframe document so portalled controls share the palette.
Toasts have separate instance IDs and follow the theme toolbar.

`.storybook/main.ts` selects the dedicated `.storybook/vite.config.ts`, avoiding
application routes, environment initialization, and package task configuration.
`vitest.config.ts` uses Storybook's official Vitest browser plugin and Playwright;
Storybook also discovers it for its **Run tests** panel. Preview annotations and
accessibility hooks are provisioned automatically by Storybook 10.6. Accessibility
violations fail browser story tests; the accessibility panel supports manual review.

`storybook:build` participates in `bun run check`. Browser tests are a separate
command because a fresh checkout needs Chromium first. Linux CI can install the
browser and its system dependencies by running `bunx playwright install --with-deps chromium`
from `packages/ui`. Existing UI unit tests still run through the explicit
`vite.config.ts` jsdom project. Storybook stories/configuration are type-checked
with the test configuration, and are excluded from production library artifacts.

For a new component, add a typed `*.stories.tsx` file in `stories/<group>`, import
its local source, and use `Meta`/`StoryObj` from `@storybook/react-vite`. Provide useful
args/Controls and real states. Use `storybook/test` for a small `play` interaction
when it demonstrates behavior; query Radix portals through the story's owner document.
Overlay and toast Docs use isolated light-theme iframes; change their Controls and
inspect light/dark themes in Canvas. Other Docs canvases follow the theme toolbar.

See the official [React Vite framework](https://storybook.js.org/docs/get-started/frameworks/react-vite),
[interaction testing](https://storybook.js.org/docs/writing-tests/interaction-testing),
and [accessibility testing](https://storybook.js.org/docs/writing-tests/accessibility-testing) guides.

## Official registry and future additions

The initial components were retrieved from `https://ui.shadcn.com/r/styles/new-york/<component>.json` on 2026-10-09. This is official registry source, adapted for this repository. Its MIT license is retained in [SHADCN_LICENSE.md](./SHADCN_LICENSE.md). Local adaptations include ESM import suffixes, a default button type, semantic theme/stacking tokens, mobile dialog bounds, progress accessibility, empty field errors, and explicit Sonner theme configuration without a Next.js theme dependency. The three reusable page states and ConnectionStatus are Raypx composition components.

`apps/web/components.json` and this package's `components.json` use the same registry style. The source-only `shadcn` export condition tells the official CLI where to generate UI files. Standard `import` and `types` conditions continue to point at `dist`; applications must not enable the `shadcn` condition at runtime.

```bash
# Read-only verification of the monorepo paths.
bunx --bun shadcn info --cwd apps/web

# Generate a future component into this package through the official CLI.
bunx --bun shadcn add <component-name> --cwd apps/web
```

After a CLI addition, adapt internal imports to this package's tsc ESM output: `@raypx/ui/utils` becomes `../utils.js` inside `src/components`, and sibling component imports become `./<component>.js`. Do not leave `@/` aliases or extensionless relative imports in emitted modules. Add the new **explicit** subpath to package exports, export it from `src/components/index.ts`, review new dependencies, and run the package checks. Generation does not replace this integration review.

## Build and checks

Shared tasks come from `@raypx/config/vite`; TypeScript uses `@raypx/config/tsconfig-presets`. `build` emits ESM and declarations through tsc and copies the stylesheet. UI tests cover meaningful keyboard/portal behavior, accessible form errors, button semantics, progress, and caller-owned state actions.

```bash
bun run vp run @raypx/ui#build
bun run vp run @raypx/ui#typecheck
bun run vp run @raypx/ui#test
```

Author: Zack <heyloyep@gmail.com>
