# @voidmix/agent-ui

## Purpose

Shared Agent business components for Web and Desktop. Applications assemble
their own workspaces and supply data, actions and platform capabilities.

## Interface

- `composer`: controlled prompt entry and submission feedback.
- `runs`: timeline, message rendering and run controls.
- `tools`: tool invocation/result presentation.
- `approvals`: controlled approval decisions and pending acknowledgement.
- `artifacts`: artifact selection, content and diff previews.
- `conversation`, `research`, `tasks`: messages, source citations and delivery review.
- `content`: private Markdown/diff wrappers.
- `model`: framework-independent event-to-view projection and public view types.
- `styles.css`: scoped business layout, using the shared UI semantic tokens.

## Ownership

- Own business presentation and transient focus, expansion and follow state.
- Own Streamdown and Pierre wrappers; vendor interfaces remain private.
- Consume public contracts as type-only imports and reusable `@voidmix/ui` primitives.
- Apps own routing, identity, requests, run subscriptions, drafts and platform IPC.

## Constraints

- Never import client, Auth, router, server runtime, native bridge or database.
- Components are controlled through props and capability callbacks; no global
  business store, network fallback data or persisted state.
- A pending approval/cancel command is not a completed Run transition.
- Rich content has a readable server fallback; browser renderers load on demand.
- Keep component subpath exports explicit. Do not expose a whole application shell.
- Labels come from the host's locale catalog. Preserve keyboard, IME, visible
  focus, long content, both themes and reduced-motion behavior.

## Verification

```bash
bun run --cwd packages/agent-ui test:component
bun run --cwd packages/agent-ui test:unit
bun run --cwd packages/agent-ui check
```

## Cloud presentation

- `conversation` exposes controlled `ConversationFeed`; `research` exposes
  sources and citations; `tasks` exposes progress and revision acceptance.
- `runs` also exposes cloud status controls and an execution timeline. Large tool
  details load only through a host callback when expanded; an expanded partial
  result refreshes when execution completes and ignores stale responses.
- `content` owns Markdown/diff wrappers. Markdown skips raw HTML and remote
  images, restricts links to HTTP(S), and has a readable SSR fallback.
- Artifact previews include text, images and sandboxed PDF display. Hosts own
  authorization, downloads, blob URLs and their cleanup.
- Artifact lists accept a platform-neutral `FileView` (`id`, `name`) rather
  than inventing Run IDs for uploaded inputs. The generic selection callback
  retains any additional host metadata without coupling the component to it.
- `model` exposes instance-scoped Conversation/timeline projection factories.
  They use durable message projections, fold new events once and preserve
  unaffected row references; explicit older pages rebuild the relevant index.
