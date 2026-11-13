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
reachable server. The earlier CLI/native runtime remains during the transition,
but the renderer does not restore a local project as its home. Web layouts serve
phone browsers. Mobile currently provides account/sign-in, with full Agent views
and notifications later in the roadmap.

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

Both sidebars put the sole Space switcher in their header and make Create Agent
the primary action. An empty Agent list offers one clear first-Agent action.
They lead to Agents and retain reachable account/security, device
preferences and permission-filtered administration/configuration. Retained Memory
views manage the earlier device/account records; do not imply they are Agent/Space
memory. Remove navigation for features whose required pages are gone. Do not show
New session, projects, session shortcuts, Waiting or the guest editor. Desktop
keeps its sidebar toggle and Search clear of native window buttons. Search covers
available pages and actions; removed workflows never appear as results. Use
consistent 20px icons with 1.75 strokes, visible keyboard focus and labelled collapsed-rail tooltips.
Keep one fixed footer for account and settings. Guests get a direct sign-in action;
the account menu manages an existing account only.

The shell owns one page title through its toolbar slots. A page may replace that
title with context, never render the title twice. Actions and scope controls sit at
the end; long English/Chinese labels truncate or wrap without covering controls.
At 375px keep the navigation rail and show either the Agent list or the selected
conversation, with a labelled back action. At 1280px the list and conversation can
sit side by side. Keep the transcript scrollable and composer reachable without
horizontal page overflow. Unsent text stays scoped to the selected conversation;
restoring it never sends. Theme and language remain reachable in either width.

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

The initial Computer slice adds a compact conversation-header state indicator,
opening a sheet on narrow screens and a side panel on wide screens. Show lifecycle
state, failure reasons and guarded start/stop controls; confirm Stop. An
unconfigured server shows one quiet explicit state with no controls. Keep future
files, output and approvals out of the panel until implemented.
Phase 1 replies have no tools, approval cards or recovery. Do not add ornamental
activity, fake progress or controls for later capabilities. When those phases
arrive, chat keeps useful progress and results while tool lifecycle belongs in the
activity view. Keep failures, unavailable states and uncertain outcomes explicit.
Charts, where used in administration, use thin columns with rounded data ends on
one baseline. Label the extremes and latest value, expose every actual value on
hover and retain a table view.

Web administration has its own /admin shell with Overview, Users, Site settings and
Audit log. A single console link leaves the personal workspace navigation uncluttered.
Use actual account aggregates and dependency observations, with explicit UTC dates
and independent unavailable states. Audit rows distinguish applied, rejected, failed,
in-progress and unconfirmed outcomes; change details never contain secrets.
