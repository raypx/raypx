# @raypx/ui

Browser-safe React presentation components based on the official shadcn/ui **new-york Radix** registry, plus reusable UI interaction hooks. UI owns appearance and accessible interaction. Requests, environment access, authentication, routing, and application state belong to its consumers. React and React DOM are peers. UI hooks do not depend on `@raypx/client` or business data.

## Public imports

Use individual component entries for application imports:

```tsx
import { Button } from "@raypx/ui/components/button";
import { Input } from "@raypx/ui/components/input";
import { Field, FieldLabel, FieldDescription, FieldError } from "@raypx/ui/components/field";
import { ErrorState } from "@raypx/ui/components/error-state";
import { Toaster, toast } from "@raypx/ui/components/sonner";
import { cn } from "@raypx/ui/lib/utils";
```

The explicit `@raypx/ui/components` entry aggregates the same component exports. The root entry keeps `Button`, `buttonVariants`, `ConnectionStatus`, and `cn` compatible and also exports `useDebouncedValue`. Do not import another package's `src` or `dist` directly.

`@raypx/ui/lib` exports presentation utilities such as `cn`. The existing
`@raypx/ui/utils` entry resolves to the same implementation as
`@raypx/ui/lib/utils`, so existing consumers continue to work.

Available component entries: `button`, `input`, `textarea`, `field`, `label`, `select`, `checkbox`, `switch`, `alert`, `badge`, `skeleton`, `progress`, `sonner`, `dialog`, `alert-dialog`, `separator`, `empty-state`, `error-state`, `loading-state`, `connection-status`, `card`, `table`, `tabs`, `tooltip`, `dropdown-menu`, `popover`, `avatar`, `pagination`, and `accordion`.

## UI hooks

```tsx
import { useDebouncedValue } from "@raypx/ui/hooks";
// Individual entry: @raypx/ui/hooks/debounce

const settledSearch = useDebouncedValue(search, 250);
```

`useDebouncedValue<T>(value, delayMs)` returns the initial input during SSR without starting timers, then publishes a changed value after typing or another interaction pauses. Changing the value or delay replaces the timer; unmount and StrictMode cleanup remove it. The delay must be finite and non-negative. Function values are returned without being invoked. The Input's `DebouncedSearch` story applies the settled value to a local list.

UI hooks depend only on React and browser-safe presentation logic. HTTP operations, session data, query caching, resource loading, and mutations belong to the client's React entrypoint and the application. Keep those dependencies out of `src/hooks`.

Product-specific hooks start in `apps/web/src/features/<feature>/hooks` beside
the feature's components and data operations. Promote data hooks into
`@raypx/client/react` once their contract is shared by multiple applications;
promote presentation hooks into this package when they are independent of
product data, routing, and application providers. See the placement and promotion
rules in [the architecture guide](../../docs/ARCHITECTURE.md).

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

Colors follow the official shadcn [neutral theme](https://ui.shadcn.com/docs/theming#default-theme-css), with dark primary actions on light surfaces and light primary actions in dark mode. System fonts remain in use. `.dark` switches the semantic palette. The application owns theme persistence and SSR initialization; this package does not read local storage or modify the document. Pass the application's resolved theme to `<Toaster theme={theme} />` and mount one toaster in its root. `system` is the default when no theme is supplied. Shared tokens include semantic stacking levels and reduced-motion rules.

The legacy Radix `destructive-foreground` token uses `primary-foreground` for readable text on destructive surfaces in each mode. Tabs use `secondary-foreground` on their muted surface, and ErrorState descriptions use `foreground/80` on their tinted surface so normal-sized text remains readable with the default neutral palette. Verify text, placeholders, focus indicators, and control boundaries when overriding the default palette; Storybook runs accessibility checks on rendered stories.

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

`Card` provides presentation slots. Put a native heading inside `CardTitle` at the level appropriate to the page. `Table` keeps native table semantics and wraps wide content in a named, focusable scroll region. Set `containerLabel` to describe that region, provide a `TableCaption`, and use `TableHead scope="row"` for row headings; column headings default to `scope="col"`. Empty, loading, and error rows can compose the existing state components inside a cell with `colSpan`. Sorting, selection, filtering, and data loading remain consumer responsibilities.

`Pagination` contains navigation primitives. The consumer supplies page totals, links, callbacks, and current-page state. `PaginationLink isActive` sets `aria-current="page"`. `PaginationPrevious`, `PaginationNext`, and `PaginationLink` accept `disabled`, which removes the destination and tab stop, exposes `aria-disabled`, and suppresses click callbacks. Previous/next text and accessible labels can be localized through `children` and `aria-label`. The controlled-list story demonstrates page changes with local rows and boundary states.

`Tabs` and `Accordion` use Radix keyboard navigation, selected/expanded semantics, and controlled or uncontrolled values. Give `TabsList` a name describing the panels. Tabs support horizontal/vertical orientation and automatic/manual activation. Accordions support a single section, optionally collapsible, or several open sections. Use `disabled` on individual triggers/items as appropriate.

`TooltipProvider` owns tooltip timing; tooltip text should supplement an already labeled trigger. Essential instructions belong in visible content. `PopoverContent` needs an accessible name and can contain labeled controls; `PopoverClose` supports an explicit completion action. Popovers and both dropdown menu levels render through portals with the shared popover layer; tooltips use the higher tooltip layer. Content bounds account for the viewport, and the shared stylesheet handles reduced motion.

Dropdown menu selections call handlers supplied by the consumer. Checkbox/radio menu items can hold caller-owned preferences. For a modal menu, the controlled example removes its trigger from the tab sequence while the menu hides the surrounding content, then restores it on close. This also covers menus that start open. Avatar images need meaningful alternative text, or empty text when an adjacent name already identifies the person. The avatar stories use a named native `figure` with decorative initials/image so the fallback preserves the same accessible name.

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
states, keyboard selection, dialog focus and dismissal, toast actions, native data
tables, local list pagination, tabs, accordions, and nested menu interactions. Preview
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
Overlay, tooltip, menu, popover, and toast Docs use isolated light-theme iframes; change their Controls and
inspect light/dark themes in Canvas. Other Docs canvases follow the theme toolbar.

See the official [React Vite framework](https://storybook.js.org/docs/get-started/frameworks/react-vite),
[interaction testing](https://storybook.js.org/docs/writing-tests/interaction-testing),
and [accessibility testing](https://storybook.js.org/docs/writing-tests/accessibility-testing) guides.

## Official registry and future additions

The components were retrieved from `https://ui.shadcn.com/r/styles/new-york/<component>.json` on 2026-10-09. This is official Radix registry source, adapted for this repository. Its MIT license is retained in [SHADCN_LICENSE.md](./SHADCN_LICENSE.md). Local adaptations include ESM import suffixes, a default button type, semantic theme/stacking tokens, viewport bounds, keyboard-accessible table scrolling, disabled pagination links, portalled submenus, accordion animation tokens, progress accessibility, empty field errors, and explicit Sonner theme configuration without a Next.js theme dependency. The three reusable page states and ConnectionStatus are Raypx composition components.

`apps/web/components.json` and this package's `components.json` use the same registry style, icon library, and base color. Both explicitly route shared components, UI interaction hooks, and presentation utilities to this package:

| Alias   | Public path            | Generation target              |
| ------- | ---------------------- | ------------------------------ |
| `ui`    | `@raypx/ui/components` | `packages/ui/src/components`   |
| `hooks` | `@raypx/ui/hooks`      | `packages/ui/src/hooks`        |
| `lib`   | `@raypx/ui/lib`        | `packages/ui/src/lib`          |
| `utils` | `@raypx/ui/lib/utils`  | `packages/ui/src/lib/utils.ts` |

The web application's `components` alias remains `#components`, so generated
application blocks go to `apps/web/src/components`. These CLI aliases apply to
UI registry files; product data hooks follow the feature placement rules above.

The source-only `shadcn` export condition is listed before `types` and `import`
and tells the official CLI where to generate UI files. Standard `import` and
`types` conditions continue to point at `dist`; applications must not enable the
`shadcn` condition at runtime. The hooks and lib directory entries also have real
runtime index exports. Add explicit exports for new generated files that other
workspaces import; the CLI does not maintain package manifests or barrel exports.

```bash
# Read-only verification of the monorepo paths.
bunx --bun shadcn info --cwd apps/web

# Preview component and dependency destinations without writing files.
bunx --bun shadcn add sidebar --cwd apps/web --dry-run

# Generate a future component into this package through the official CLI.
bunx --bun shadcn add <component-name> --cwd apps/web
```

After a CLI addition, adapt internal imports to this package's tsc ESM output:
`@raypx/ui/lib/utils` becomes `../lib/utils.js` inside `src/components`, sibling
component imports become `./<component>.js`, and shared hook imports become
`../hooks/<hook>.js`. Do not leave `@/` aliases or extensionless relative imports
in emitted modules. Add each new **explicit** component, hook, or utility subpath
to package exports and export it from its corresponding `src/*/index.ts`. Review
new dependencies and run the package checks. Generation does not replace this
integration review.

This organization follows the official [shadcn monorepo guide](https://ui.shadcn.com/docs/monorepo).

## Build and checks

Shared tasks come from `@raypx/config/vite`; TypeScript uses `@raypx/config/tsconfig-presets`. `build` emits ESM and declarations through tsc and copies the stylesheet. UI tests cover meaningful keyboard/portal behavior, accessible form errors, button semantics, progress, and caller-owned state actions.

```bash
bun run vp run @raypx/ui#build
bun run vp run @raypx/ui#typecheck
bun run vp run @raypx/ui#test
```

Author: Zack <heyloyep@gmail.com>
