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

## Authentication composition

`@raypx/auth/client` keeps its injected `AuthForm` contract. Its private presentation
composes labelled fields, password requirements, request feedback and terminal
confirmation states; existing hooks own requests, cooldowns and completion retries.
The form has a 25rem maximum width and no outer gutters. Web owns its centered
60rem panel, public header and product-facts region; Desktop owns its compact
single-column panel, native title-bar drag area and return action. Do not add a
second card inside either panel or expose app-specific routing through Auth.

The application browser suites cover all five modes, both locales/themes, narrow
and short windows, input preservation during locale changes, link recovery,
password autocomplete and duplicate submission. Shared Auth component tests cover
mail cooldowns, errors, credential clearing and completion retries. Browser
renderer results and screenshot review are recorded separately from native host
acceptance.

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

## Workbench refinements

BeUI Diff Review's file headers and short fold transitions inform the approval
preview. Each file can fold independently; counts describe only the bounded
preview, while the original request remains available. Approval decisions still
apply to the complete request. Consecutive tool events form a compact visual
group without merging their stable IDs, revisions or virtual reading anchors.
The current projection supplies tool names and statuses, not tool input/output.

Files keeps the list/editor split, route breadcrumbs, save shortcuts and dirty
draft protection. Its editor separates filename, parent path and document status;
the compact list retains file sizes. References search only loaded names and
categories, after project eligibility. Schedule search and enabled/paused filters
use the same controlled `AutomationFilters` in local and cloud views, after their
existing target constraints. Filtering does not close an editor or run history.

Computer details group reported projects and Agent readiness separately from
connection state and disconnect actions. Administration audit details separate
request metadata from readable Before/After snapshots; null and unconfirmed
outcomes remain explicit.

`CollapsibleContent animated` opts into Base UI's measured-height fold: 200ms,
ease-out, with matching chevrons. Keep padding inside the animated panel. Keyboard
focus disables the transition, and reduced motion removes it entirely. Routine
tabs only transition their colors/shadow for pointer use. Streaming messages,
virtual row placement, search results and workbench page sections do not animate in.
Public pages render their content without entrances. The homepage's application
frame uses `scrollSettle` from `src/components/brand-accent.ts`, a scroll-linked scale
and offset that never changes opacity. The same module defines the logo palette as
`--brand-*` properties on the landing and authentication layouts. Homepage ambient loops are the only
autoplaying motion: `ParticleField` draws a canvas constellation and `FlowPackets`
animates the connection line with the Web Animations API; both stop offscreen and in
hidden tabs, and the frame light is a CSS rotation hidden under reduced motion.
`useDemoPlayback` in `demo-playback.ts` plays the example's steps after it has been
visible for a moment; `demoStage` derives each frame from progress so playback only
fades content and the frame keeps its height. Hover, step-card focus, offscreen and
hidden tabs hold it; choosing a step or the autoplay toggle stops it.
Pointer-follow spotlights and artwork shifts respond to hover only. Reduced motion
removes all of it.

## Preview and validation

The public homepage pairs its main actions with a labelled interactive workflow
example: session, Diff review and result. This is illustrative data, not an account
projection or an executable session. Keep the connected-computer action separate
and retain its existing session/pending/error behavior. The preview's selected
indicator and content move in the workflow direction for 200ms after pointer
input; keyboard and reduced-motion changes are immediate. It has no autoplay,
infinite effects, animation dependency or private feature reads.
Keep the homepage concise: icon/name links carry navigation, the Desktop-to-Web
diagram explains the connection boundary and `HelpHint` exposes draft privacy.
Workflow examples use code, file changes and receipt markers instead of repeated
explanatory paragraphs. The example notice remains visible; diagrams never imply
an observed connection or live account state.

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
