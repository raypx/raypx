# Raypx visual system

Keep original logos and brand artwork. Use neutral light/dark semantic tokens, Base UI
for DOM primitives, Tailwind v4, Hugeicons Free through `@raypx/icons` and the existing
system font stack. The only color beyond the neutral palette is the logo accent that
public pages may use as decoration, scoped in the public-page rules below.
Primary actions are dark on light backgrounds and light on dark backgrounds.
Express feature styles and responsive states with Tailwind utilities in components.
CSS entry points register sources and shared styles; avoid feature-specific selectors.

Keep Web and Desktop compact with one control scale: 24px `xs` for inline buttons,
28px `sm` for dense actions and filters, 32px default for ordinary controls, 36px
`lg` for prominent actions, and 44px `xl` for standalone authentication forms.
Use component size variants rather than per-page height overrides. Input,
InputGroup and PasswordInput call this prop `controlSize` so native input `size`
still describes character width. SelectField forwards `size` to its trigger.
Coarse pointers retain at least 44px interaction targets; narrow inputs retain
16px text to avoid browser zoom. Multiline and content rows grow with their text.

Use 12px secondary/compact text, 14px control/body text, 18px section headings and
24px page headings. Button icons follow their size: 12px in `xs`, 14px in `sm`
and 16px by default; navigation icons stay 20px. Controls use the shared radius
scale: `md` for small controls and `lg` for default and larger controls.
Use Tailwind's spacing scale, preferring 4px steps, with 2px adjustments inside
compact controls. Related controls use 8px gaps, groups 16px and sections 24px.
Keep workbench surfaces flat: use the background for the main canvas, muted surfaces
to separate regions, and a single border for grouped controls or editable areas.
Settings and data lists use labelled rows and separators rather than nested cards.
Reserve `shadow-popover` for floating menus, search results and popovers; static rows
do not lift on hover. Use tabular numerals for counts, dates and table measurements.
The shell owns page widths and gutters: document pages cap at 48rem, workbenches
at 100rem, and tools fill the content region. Pages do not add outer widths or
gutters. Sidebar navigation rows share a 36px minimum height and
20px icons; touch navigation keeps a 44px minimum.

Agents is the signed-in home in Web and Desktop. Web keeps its public landing
page at `/`; account details use the footer menu in Web and `/account` on Desktop.
Guests sign in before opening
conversations; there is no guest task editor or draft handoff. Preserve validated
return destinations for account and administration flows. Conversations need a
reachable server. The CLI supplies device I/O and private Desktop sessions; the renderer never
restores local execution history. Web layouts serve
phone browsers. Mobile provides native Space Agents/groups, membership and
invitations, routines, memory, resource catalogs, activity, approvals and computer
lifecycle. Full Page/resource management uses Web. Native Mobile omits Screen;
the phone Web client provides viewing and takeover. Push notifications remain later work.

Public pages (landing, authentication, privacy) share one header, which gains a surface
only after scrolling. The landing header adds a compact account avatar with the same
account, settings and permission-filtered administration menu as the sidebar, and the
landing footer groups brand copyright with privacy and GitHub links. Public pages may
add texture: a masked neutral dot grid, framed surfaces and artwork built from tokens
and Hugeicons. Artwork is `aria-hidden`; privacy artwork stays abstract. The homepage
and the authentication side region may use the logo palette (sky, blue, violet, pink)
for glows, gradient marks and selection accents, never for controls or text that must
be read, and may show example interfaces with fixed sample data when each frame is
labelled as an example. The workbench never uses the logo palette.

The homepage shows a centered hero, a labelled static conversation example, a
three-step Space/Agent/conversation overview, links to available screens and a
clearly marked later-capabilities section. Its authentication side region uses
the same phase 1 facts. Do not depict tool approvals or computer execution as
available in phase 1. Decorative hero trails and frame light may animate on the
existing timeline, pause offscreen/in hidden tabs and become static with reduced
motion. Conversation examples do not autoplay. Authentication and legal pages
render without entrances or loops. Label sample content and never invent usage,
customer results, testimonials or pricing.

The signed-in workspace has one directory: a quiet sidebar about 220px wide,
collapsible to a labelled icon rail. Its background sits one neutral step from
the canvas, with no heavy dividing border. The top row holds the original logo,
notifications when available, Search and collapse. A plain New row starts a
conversation with the last used or chosen Agent. Flat Routines, Pages and Tools
rows precede collapsible Agents, Groups, Space and Recent sections. Muted section
labels reveal actions on hover and keyboard focus. An empty Agent section has one
inviting card and one Create Agent action; group creation has one clear section
action. Recent combines existing direct/group list projections, sorts by
lastActivityAt and uses dense truncated single-line rows with an overflow menu.
Never invent conversation titles or activity. The account avatar, name and actual
role stay at the bottom, with Invite members below for owners. Account/security,
device preferences and permission-filtered administration remain reachable.
Memory belongs to the selected Agent or Space. Removed task, enrollment and
local-history workflows never appear in navigation or Search. Search contains
current destinations and actions only. Desktop keeps its native
window-control insets clear and device settings available at /login#settings.

At /agents with no conversation selected, leave the canvas open. Vertically
center the original logo mark, one short question heading and a rounded composer
about 600px wide. A multiline input sits over a compact toolbar: add context,
Agent target, Computer state/start, model and approval controls, then round Send.
Use actual available context and configuration; unavailable actions explain why.
Sending opens the chosen Agent's continuing conversation. Small muted legal/help
links sit at the foot of the canvas. Do not invent suggested follow-ups.

A selected conversation fills the remaining workspace without a second directory
column. Its sticky top bar owns one truncated Agent/group title, a Back action
at narrow widths, Conversation/Activity/Files text tabs and capability/overflow
actions. The reading column centers at 680–720px, with 15–16px text and comfortable
line height. Member messages form compact right-aligned neutral bubbles; Agent
replies are plain Markdown on the canvas. Headings, lists, inline code, labelled
copyable code blocks and horizontally bounded tables preserve safe rendering.
Completed replies have quiet copy/retry/steer actions and a real N steps fold
for tool activity, effects, approvals and delegated work. Activity shows the Run
timeline; Files shows bounded computer files. Wide screens add quiet context
cards for the Computer/Screen, pending approvals and memory/routines. Narrow
screens retain accessible sheets with their existing focus and Escape rules.
The composer floats at the bottom of the reading column, with Still working and
pending approvals immediately above it. Addressed protected-input forms share
that rounded card stack across all conversation tabs, with masked fields and
visible destination, expiry and privacy details. Values stay separate from the
composer and clear when leaving the surface. Keep history paging, reading anchors,
streaming, draft isolation and every existing lifecycle control.

Chrome uses 13–14px text, small line icons and hairline separators only where they
help reading. Cards use rounded-xl corners. Soft shadows belong to floating
composers and overlays; ordinary rows remain flat. Icon buttons gain a surface on
hover/focus. Long English/Chinese labels truncate or wrap without covering
controls, and coarse pointers retain 44px targets. At 375px keep explicit labelled
navigation and a reachable composer without horizontal page overflow. Theme and
language remain reachable at every width. Mobile follows the same directory,
home and Conversation/Activity/Files hierarchy using native controls, keyboard
avoidance and safe areas; Screen still uses the phone Web client.

Forms have visible labels and errors, keyboard focus, sensible autocomplete and
pending-state controls. Empty and unavailable states explain real capabilities.
Theme and language follow the device by default and retain explicit local choices.
Respect reduced motion, narrow screens, long Chinese/English content and large fonts.

Authentication uses one centered, bordered panel with a 16px radius. Web keeps the
original logo and theme/language controls in a shared public header. At 1024px and
above, the panel caps at 60rem and pairs the form with numbered phase 1 product
facts in a static side region; narrower screens use one column
and natural document scrolling. The form caps at 25rem. Desktop uses a compact
single-column panel inside its native title-bar frame, with the return-to-workspace
action above it. Applications own panel padding; shared Auth owns only field rhythm and
feedback. All five modes share the same title, description, field, primary-action and
footer hierarchy, and registration states that replace the form (unavailable, closed)
use the same centered status, title and full-width action as its completion states.
Successful password resets and verified email links replace the form with a clear
confirmation and next action. Invalid links offer recovery. Email-send states keep
the address and resend countdown visible; completion refresh retries do not repeat
credential submission. Password constraints, errors and visibility controls remain
grouped with the relevant field. These layouts use the same 44px controls in both
applications and retain password-manager autocomplete.

High-frequency controls respond immediately; color and focus transitions use the
shared 150ms control cadence. Menus and popovers enter in 150ms with ease-out and
small displacement; sheets may use 200ms. Animate state changes, not workbench page
sections or every arriving message; public pages follow the motion rules above.
Reduced motion removes movement, fades and spinning.
Keep browser text selection and carets aligned with the neutral palette. Coarse
pointers receive 44px menu/search targets and expanded checkbox/radio/switch hit areas.

Searchable option sets use the Base UI Combobox from UI. A labelled trigger opens
a separately labelled search input, grouped options retain their headings, disabled
choices remain readable and an empty search has a concise status. Escape closes
the popup and restores focus without changing the selection. Multiline input with
a context or action toolbar composes InputGroupTextarea and block addons; its
value, ref, keyboard handlers and submission state remain owned by the caller.

Let icons, layout and interaction carry meaning before prose. Page titles use the
navigation name; add at most one short subtitle, only for what the controls cannot show.
Move secondary explanations into tooltips, empty states, disabled-state reasons or
contextual help (`HelpHint`). Keep inline text for errors, permissions, destructive or
irreversible actions and privacy disclosures. Icon-only controls use `IconButton`, which
carries an accessible label and a tooltip. Chinese and English copy stay equally short
and change together.

Application chrome composes the shadcn Sidebar with a persistent icon rail on
narrow screens. Agent conversations show member messages and replies, with stable
order and reading position as text streams. Enter sends, Shift+Enter inserts a
newline and IME owns composition. Show queued, running, failed and cancelled states
accurately, with explicit stop and retry editing. Announce Run lifecycle changes
without announcing every streamed token. A failed-Run retry restores text for a
new explicit Send; an uncertain delivery retains its receipt identity.

The Computer surface exposes the actual Space lifecycle in the composer and
conversation context. Wide layouts use a quiet rail card; narrow layouts open a
sheet. Show failure reasons and guarded start/stop controls; confirm Stop. An
unconfigured server shows one quiet explicit state with no controls. Screen keeps
explicit graphical start/stop, a fitted live image, view pause and exclusive
Take/Release control. Show the control holder, remaining lease and Agent input
pause. Forward keys only from the focused controlled screen; Tab keeps normal
navigation and Escape releases control without closing the panel. Keep file
previews and tool activity bounded. Screen frames have no entrance or transition.
Expand opens a large dialog with the same live view and controls, using the existing
controller and stream. While controlling, Escape releases control and keeps the
dialog open; the next Escape closes it and restores focus to Expand.
Render actual progress and results; keep tool lifecycle in Activity and the
reply's steps. Do not add ornamental activity, fake progress or controls for
unavailable capabilities. Keep failures, unavailable states and uncertain outcomes
explicit. Durable conversations render real tool activity and addressed approval
cards. Active Runs outside the loaded history window use a compact Still working
strip above the composer, with Agent attribution, state and direct controls.
Space HTTP APIs live beside remote tools in settings; operation and approval rows
distinguish read-only calls from changes without exposing credentials.
Charts, where used in administration, use thin columns with rounded data ends on
one baseline. Label the extremes and latest value, expose every actual value on
hover and retain a table view.

Web administration has its own /admin shell with Overview, Users, Site settings and
Audit log. A single console link leaves the personal workspace navigation uncluttered.
Use actual account aggregates and dependency observations, with explicit UTC dates
and independent unavailable states. Audit rows distinguish applied, rejected, failed,
in-progress and unconfirmed outcomes; change details never contain secrets.
