# Frontend components and source adaptation

Web/Desktop compose `@raypx/ui` shadcn/Base UI controls, neutral tokens, Tailwind
utilities, translated copy and `@raypx/icons`. Read root `DESIGN.md` for sizes,
layout density, motion and public decoration. Mobile uses native controls and
pure shared tokens, not DOM components.

## Ownership

- UI owns accessible primitives, tokens, common patterns and overlay behavior.
  Public entries need established consumers and component registry metadata.
- Blocks owns shared application chrome, Markdown and settings patterns. Apps
  supply routes, account context and native capabilities.
- Feature models own injected ports, selection and state. Feature clients adapt
  those models to React without taking over authorization or persistence.
- Applications own routing, authentication/session loading and platform adapters.

`@raypx/agents/model` owns Space/Agent/group selection, history windows, event/cursor
convergence and draft/send receipts. `/client` renders the Web/Desktop workspace;
Mobile supplies a native view and ports. The shell owns widths, gutters and one
page title. The sidebar has the Space switcher and Agent/group directory. Narrow
layouts preserve explicit Back navigation, selection and focus.

## Conversations and capabilities

Conversation rows keep stable message/Run identity across queue, streaming and
commit. Reading follows output only near the bottom and otherwise preserves an
anchor with a jump-to-latest action. History paging is explicit and independent
of replay cursors; virtual and full-text modes preserve reading position. Enter
sends, Shift+Enter inserts a newline and IME owns composition. Only lifecycle
changes are announced, never every token or countdown tick.

Replies use shared safe Markdown, with no raw HTML, executable URLs or remote
images. Pending approvals render once as addressed cards; resolving them folds
status into activity. Tool rows contain bounded names/targets/status and durations,
not raw arguments or private output. Unknown effects remain explicit. Delegated
work appears under the parent activity without fabricating child replies.

The header's computer indicator opens a sheet below 1280px and a side panel above.
Show real lifecycle/failure state, guard repeat commands and confirm Stop. File
previews are bounded read-only access and do not start compute. No configured
provider means an unavailable state without lifecycle controls. Computer tools
still require backend admission and approval/effect policy.

Routines and Space memory open header sheets, or the compact overflow menu at
narrow widths. Pages mounts at `/pages` with versions, restore and sharing. Web
can embed sandboxed authenticated documents; Desktop always opens Web preview.
Models, approval policy, Skills and Tools compose account settings. Closing editors
clears one-time secrets; failed mutations preserve ordinary drafts for retry.

## Controls, focus and motion

Use existing UI primitives rather than native select/radio/details elements.
Searchable sets use Combobox; short choice sets use Select. Give triggers and
search fields distinct labels, preserve grouped options/disabled choices, and
provide explicit empty/error feedback. [Combobox](components/combobox.md) contains
composition examples. Icon-only controls use IconButton; secondary explanations
use HelpHint. Keep permission and destructive-action consequences visible.

Sheets/dialogs own headings, initial focus and return focus to the visible opener,
including after viewport changes. Escape should close the active overlay once,
without a tooltip trapping it. Pending actions guard duplicate submission.
`CollapsibleContent animated` uses measured-height folds; keyboard focus and
reduced motion remove movement. Streaming rows and whole workbench sections do
not animate in. Keep 44px touch targets and long English/Chinese labels usable.

Use Tailwind utilities for feature layout. CSS entry points contain imports,
source registration, shared tokens and necessary library/global rules only.
Preserve original logos and neutral light/dark workbench colors. Logo-palette
public decoration pauses offscreen/in hidden tabs and becomes static under reduced
motion; examples never imply observed private activity.

## Authentication and public pages

Shared Auth owns fields, validation, pending states, completion and recovery;
applications own layout and navigation. Preserve credentials/validated destinations
when switching language. Private features wait for confirmed session/access and
show retry feedback on failed checks. Guests keep landing/legal/authentication
pages and device preferences; guest task handoff and project/session editors are
removed. The service worker supplies a bilingual network retry page without
caching private data, documents or API traffic.

Public examples use labelled fixed sample conversations and never mount execution
clients or issue private reads. Do not fabricate progress, testimonials or live
connections. Keep explanatory copy short and accessible.

## Adapting source and verification

Inspect source before adapting a composition. Reuse local primitives, controlled
state, tokens, catalogs and ports rather than copying another application's
routing, provider state or toolchain. Preserve required notices/provenance for
copied code. Never copy simulated success, auto-approval or premature input clearing
into real flows.

`bun dev:storybook` previews UI specimens on 6006. Feature component suites verify
real transitions, explicit loading/error state, focus, IME and both languages;
await state before reading triggered effects. Application browser journeys verify
compiled routes and private-state boundaries. Owned-backend journeys add actual
PostgreSQL/listener/deterministic-tool behavior. See [testing](testing.md).

Run focused suites and `bun run verify` for implementation. Conversation reading
changes use `conversation-history.spec.ts` on both browser surfaces; retained
`perf:tasks` measures device-task helpers independently. Browser fixtures establish
no packaged WebView, Mobile device or installer result. Unrun platforms remain
unverified.
