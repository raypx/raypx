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
page title. A single quiet 220px sidebar owns the Agent/group directory, compact
Space switcher and Recent list; there is no second list beside chat. Recent sorts
existing list lastActivityAt values without extra authority or fabricated titles.
Plain New opens the centered home composer, whose explicit Agent choice controls
where Send goes. Agent and group creation remain distinct section actions, with
one inviting first-Agent action in an empty Space. Account and owner invitations
stay at the foot. Collapsed/narrow navigation keeps labels, focus and explicit
Back navigation. The original logo and neutral tokens are unchanged.
Agent section actions include a local name filter. Opening it expands the section
and focuses its labelled input; Escape clears a nonempty query, then closes the
empty filter and returns focus to its opener. Collapsing the sidebar keeps the
full directory reachable. In an empty narrow home, the sole Create Agent action
moves to the canvas so its purpose remains visible beside the icon rail.

Home uses one short question and a roughly 600px floating rounded composer.
Conversation uses a centered 680–720px reading column and the same composer
anatomy: multiline input, context, target/Computer, model/approval controls and
round Send. Member messages are compact right bubbles; Agent Markdown sits on
the canvas at 15–16px. UI text is 13–14px, cards rounded-xl, separators hairline
and shadows limited to floating surfaces. No synthetic follow-ups or notification
counts appear.

## Conversations and capabilities

Conversation rows keep stable message/Run identity across queue, streaming and
commit. Reading follows output only near the bottom and otherwise preserves an
anchor with a jump-to-latest action. History paging is explicit and independent
of replay cursors; virtual and full-text modes preserve reading position. Enter
sends, Shift+Enter inserts a newline and IME owns composition. Only lifecycle
changes are announced, never every token or countdown tick.

Active Runs whose triggering messages are outside the loaded window appear in a
bounded Still working strip above the composer. Show Agent attribution, state and
origin/untrusted markers; Stop, addressed approvals and targeted Steer work without
loading history. Show Run loads the trigger page and hides the strip row once its
message is loaded. Preserve the composer, reading anchor and visible steering
target; an uncertain-send receipt keeps that exact target. Truncation has an
explicit refresh action. The shared model owns this projection for all clients.

Replies use shared safe Markdown, with no raw HTML, executable URLs or remote
images. Pending approvals render once as addressed cards; resolving them folds
status into activity. Tool rows contain bounded names/targets/status and durations,
not raw arguments or private output. Unknown effects remain explicit. Delegated
work appears under the parent activity without fabricating child replies.

Protected-input forms sit with pending approvals above the composer in every
conversation tab. Use the same rounded neutral cards, a masked uncontrolled
field and the existing independent metadata controller. Normal approval stays
separate. Values never enter the composer, drafts or caches and clear on submit,
decline, backgrounding and unmount. Home and the Pages workspace retain addressed
Space requests when no conversation column is mounted.

The sticky conversation bar has Conversation, Activity and Files text tabs,
one Agent/group title and capability/overflow actions. Completed replies expose
quiet actions and a real steps fold, preserving tool/effect/approval/delegation
inspection. Activity contains the existing timeline; Files contains bounded
computer access. Wide layouts use quiet right-rail context cards for Computer,
Screen, pending approvals and capability shortcuts. Narrow layouts retain sheets.
Show real lifecycle/failure state, guard repeat commands and confirm Stop. File
previews are bounded read-only access and do not start compute. No configured
provider means an unavailable state without lifecycle controls. Computer tools
still require backend admission and approval/effect policy.
The Computer context card and narrow sheet keep the per-conversation device picker.
The composer chip reflects that selection and opens its controls; it never starts
the team sandbox while a device selection is active or still loading. Files is
explicitly labelled Team sandbox because its read port is Space-scoped and cannot
browse a selected device directory. Devices management stays in Space settings.

Screen is a separate computer section. Its optional port mounts only while the
computer panel is open. Pixel state is disposable and never enters draft storage.
Test control-holder changes, view-only input refusal, focused keyboard input,
composed text, Escape release/return focus, owner forced release and disconnect
cleanup. Frames have no CSS animation; Pause view stops delivery and releases
control. Responsive screenshots use 1440×860 and 375×812. Mobile currently omits
Screen; the phone Web layout provides it.

Expand opens a large Screen dialog with the same live view and controls. Reuse
the existing controller, viewer identity and stream; moving between compact and
expanded views must preserve its grant and avoid duplicate subscriptions. While
controlling, Escape releases input and leaves the dialog open. A subsequent
Escape closes it and returns focus to Expand. Keep this behavior for the screen
surface and composed-text field, and retain the explicit Release control action.

Routines and Space memory remain reachable through sidebar/context shortcuts
and the compact conversation overflow menu; narrow layouts retain their sheets. Pages mounts at `/pages` with versions, restore and sharing. Web
can embed sandboxed authenticated documents; Desktop always opens Web preview.
Models, approval policy, Skills and Tools compose account settings. Closing editors
clears one-time secrets; failed mutations preserve ordinary drafts for retry.

Tools places Space-owned HTTP APIs beside member-owned remote MCP servers. Owners
paste OpenAPI JSON/YAML or fetch a document once, test the registered endpoint,
select operations and choose all/selected Agent availability. New imports expose
no operations until selected. Bearer/header credentials are write-only and clear
on submit or close; deletion requires confirmation. Activity and approval cards
show readable operation labels, method and read/change classification; effects
use the existing inspector. Mobile renders activity and approvals, while API
management remains in Web/Desktop. Keep long names and controls within the phone
viewport without horizontal overflow.

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
changes use `conversation-history.spec.ts` on both browser surfaces.
`active-runs.spec.ts` covers reload, off-window approval and trigger-page loading;
`openapi-tools.spec.ts` covers registration, selected read/change calls, approval
and effects through the owned backend. Measure geometry only after surfaces are
at rest, use explicit short timeouts and isolate each case's resources. Retained
`perf:tasks` measures device-task helpers independently. Browser fixtures establish
no packaged WebView, Mobile device or installer result. Unrun platforms remain
unverified.

## Automatic approval display

Approval mode controls enable Auto only from the server's availability projection
and show its actual reason code when unavailable. Space mode exceptions and
effective-mode labels include Auto. Automatic decisions show “Approved automatically”
or their denial state with the bounded review reason, distinctly from member
answers, including after reload. They retain the independent Run Stop action.
Mobile's native account mode picker uses the shared revisioned model; Space mode
exception management retains its Web handoff.
