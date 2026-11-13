# Frontend components and source adaptation

Raypx's Web and Desktop interfaces use the same `@raypx/ui` shadcn base-nova
components backed by Base UI. `DESIGN.md` defines the neutral light/dark palette, the
scoped public-page accent, control sizes, layout density and motion. Feature code
uses Tailwind utilities, translated copy and icons from `@raypx/icons`.

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

The `/agents` workspace follows the same split: `@raypx/agents/model`
owns page selection, event/cursor convergence and injected command, stream and
draft ports; `/client` owns the shared Space/Agent forms and bounded transcript.
The shell renders one title. The directory and conversation fill the tool layout;
the sidebar header owns the sole Space switcher and the primary Create Agent action.
Agent rows truncate names, show models and keep actions in a row menu. Narrow
layouts use Back navigation. The transcript scrolls independently of its growing
composer, follows output only near the bottom and offers a jump back to latest.
Runs own their reply status; completed replies have no status label. Enter sends,
Shift+Enter inserts a newline and IME composition keeps Enter. Both Tasks and Agents
use `@raypx/blocks/markdown`: GFM without raw HTML, executable URLs or remote images,
with safe external links and fenced-code copy/manual selection. Reply rows retain
their identity as streaming text commits; only reply lifecycle changes are announced.
Web uses the cookie-authenticated `/events` socket and Desktop injects its
credential-free daemon bridge. Component suites cover both languages, explicit
retry, reconnect/snapshot recovery and stale account completions. The Web
`e2e/agents.spec.ts` uses the owned backend's gated deterministic model to observe
streaming before commit and identical history after reload.
Native Mobile uses a separate RN implementation; only pure tokens and brand
assets cross from UI into Native.

The conversation header's compact computer indicator opens a narrow-screen sheet
or wide-screen side panel. Its model consumes the Space-scoped lifecycle contracts,
applies `computer.state` events and refreshes on reconnect. Show real lifecycle
state and failure reasons, guard repeated activation and confirm Stop. An
unconfigured provider has no controls. The panel contains no placeholder files,
command output or approvals; Agent tools and approvals remain unimplemented.

## Authentication composition

`@raypx/auth/client` keeps its injected `AuthForm` contract. Its private presentation
composes labelled fields, password requirements, request feedback and terminal
confirmation states; existing hooks own requests, cooldowns and completion retries.
The form has a 25rem maximum width and no outer gutters. Web owns its centered
60rem panel, public header and product-facts region; Desktop owns its compact
single-column panel, native title-bar drag area and return action. Do not add a
second card inside either panel or expose app-specific routing through Auth.

The application browser suites check all five auth modes in a narrow viewport,
including password autocomplete. Separate journeys cover input preservation during
locale changes, link recovery and duplicate submission. Shared Auth component tests cover
mail cooldowns, errors, credential clearing and completion retries. Browser
renderer results and screenshot review are recorded separately from native host
acceptance.

## Installable Web app

On HTTPS, browsers that support PWA installation can add Raypx from the browser
menu or install control. The installed window opens `/agents` and uses the
existing Web sign-in and preference flows. Apple devices use the same Raypx mark
through the touch icon.

The Web quick settings dialog has an install row. It opens the browser's native
installer when offered and gives browser-menu instructions otherwise. The
offline page uses a centered status and one retry action. Its press feedback
respects reduced motion. [ReUI Empty](https://reui.io/docs/empty) ·
[beUI Button](https://beui.dev/r/button-base.json)

The production service worker returns the current document from the network.
If a navigation cannot reach the network, it displays a standalone retry page
in the browser's language. The worker keeps Cache Storage empty and leaves API
requests, assets and draft storage to their existing owners. Web conversation access
requires a connection.

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
Public pages render their content without entrances. `src/components/brand-accent.ts`
defines the logo palette as `--brand-*` properties for the landing and authentication
layouts. `HeroArtwork` adapts the editable MotionHarness scene to the Web layout. It
caches the static canvas trails and draws the travelling highlights and frame light on
the same eight-second clock. `FlowPackets` animates the connection line with the Web
Animations API. Both pause offscreen and in hidden tabs, and reduced motion draws
the static trails and hides the lights.
`useDemoPlayback` in `demo-playback.ts` plays the example's steps after it has been
visible for a moment; `demoStage` derives each frame from progress, so playback only
fades content and the frame keeps its height. Hover, step-tab focus, offscreen and
hidden tabs hold it; choosing a step or the autoplay toggle stops it. Pointer-follow
spotlights and artwork shifts respond to hover only. Reduced motion removes all of it.

## Preview and validation

The [Combobox guide](components/combobox.md) links the public API, interactive
Storybook examples and the Web and Desktop task-page browser cases.

The public homepage pairs its main actions with a labelled workflow example (session,
diff review and result) in an application frame with integrated step tabs. The frame
uses fixed sample data. Step tabs select the example and show
playback progress; keep the connected-computer action separate and retain its existing
session/pending/error behavior. Workspace links show labelled example interfaces with
fixed sample data. Examples use code, file changes and receipt markers instead of
explanatory paragraphs, `HelpHint` exposes draft privacy, the example notice remains
visible and diagrams never imply an observed connection or live account state. The
landing E2E spec exercises the autoplay control with reduced motion enabled, manual
step selection with pointer and keyboard, and draft privacy help. The access journey
follows the project link and verifies session changes without private reads.

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
