# Frontend components and source adaptation

Raypx's Web and Desktop interfaces use the same `@raypx/ui` shadcn base-nova
components backed by Base UI. `DESIGN.md` defines the neutral light/dark palette,
control sizes, layout density and motion. Feature code uses Tailwind utilities,
translated copy and icons from `@raypx/icons`.

## Ownership

- UI owns tokens, accessible controls, shared visual patterns and overlay behavior.
  New primitives have a real feature consumer, use public exports and are recorded
  in `packages/ui/shadcn-components.json`.
- Blocks owns shared application chrome and settings rows. Applications supply
  routing, account content and native capabilities. The Desktop window frame keeps
  its title-bar insets and drag regions.
- Feature packages own product views and their controlled values. Tasks/model owns
  editor and submission transitions; Tasks/client adapts them to React. Views use
  the existing ports and authoritative request state.
- Applications own routes, authentication/session loading and platform adapters.
  Native Mobile uses a separate RN implementation; only pure tokens and brand
  assets cross from UI into Native.

## Adapting external source

The 2026-11-09 CollectUI archive review selected ReUI's Echo Chat, Flux AgentOps,
Tempo Tasks, Filespace Drive and Lucent DevOps as references for composition and
information hierarchy. The templates snapshot is
`65e2898e445e49b1bcd9d4333fb392bcda1cba40`. BeUI's grouped model selection and
asynchronous approval feedback, and Studio's controlled table toolbars/settings
rows, provide additional references. These sources guide local feature
compositions; Raypx does not install or synchronize whole template applications.

For each selected component:

1. Read its actual implementation and choose only the required structure.
2. Compose existing UI primitives. A matching Base UI dependency still requires
   checking props, labels, portal placement and controlled state. Radix or Headless
   UI implementations require recomposition with Base UI.
3. Use Raypx's tokens, size variants, translations and icon exports. Keep template
   routing, providers and toolchain outside shared packages.
4. Connect controlled values and asynchronous actions to the owning feature.
   Search and popup state can remain local. Submission, drafts, model defaults,
   approvals and receipts stay with their existing owners.
5. Verify keyboard/focus, IME, loading, empty, error/retry, pending and unavailable
   states. Check the rendered page in both themes and at narrow widths.

Do not bring simulated success, timers, authentication, auto-approval or immediate
input clearing from template examples into the product. Conversation composition
continues using Raypx's virtualizer, history coverage and reading anchors. Source
copied directly must retain its applicable notices and record its origin/version;
updates are reviewed selectively alongside local changes.

## Preview and validation

`bun run dev:storybook` previews UI-only specimens, including foundation state
matrices. Storybook consumes UI public entries and static data; product flows
belong in their owning component tests and application browser journeys.

Run the focused affected suites and `bun run verify` for code deliveries. The Web
and Desktop E2E runners exercise the compiled applications with isolated fixtures;
they cover routing, private-state boundaries and user interactions. Preserve
those assertions when changing structure. Browser renderer checks do not establish
native WebView or installer acceptance.

Use `bun run perf:tasks` and the existing conversation browser performance journey
for list/history changes. Keep input and focus targets reachable, preserve full-text
selection, and compare measurements under the same workload. Release gates and
platform prerequisites remain in [Testing and verification](testing.md).
