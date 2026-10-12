# @voidmix/storybook

## Purpose

The UI component workbench for `@voidmix/ui`. It provides isolated stories and
visual documentation without becoming a product application.

## Interface

| Path                   | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `.storybook/`          | Storybook framework, addons, and global preview setup |
| `src/**/*.stories.tsx` | Component stories and documentation                   |

## Ownership

- Own stories, Storybook configuration, and the component-workbench workflow.
- Consume `@voidmix/ui` and its exported styles; do not duplicate primitives.
- Do not import product routes, API handlers, database code, or application
  feature modules.

## Constraints

- Keep stories deterministic and network-free. Neutral workbench stories cover
  both themes, long headings, loading/error feedback and keyboard Tabs.
- Use the shared `@voidmix/ui/styles.css` entry so the base-nova Tailwind
  tokens and primitive styles match the applications.
- Add stories for reusable UI primitives before adding stories for application
  composition.
- Storybook is development tooling, not a production runtime or deployment
  target.

## Verification

```bash
bun run --cwd apps/storybook check
bun run storybook:build
bun run storybook
```

## Agent views

- Cloud business stories consume `@voidmix/agent-ui` and its stylesheet.
- Fixtures are explicitly deterministic examples: source links, delegated
  execution, pending cancellation, revision review, IME input and both themes.
- Stories never import clients, routes or production data.
