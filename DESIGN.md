# Raypx visual system

Keep original logos and brand artwork. Use neutral light/dark semantic tokens, Base UI
for DOM primitives, Tailwind v4, Hugeicons Free through `@raypx/icons` and the existing system font stack.
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
gutters. Sidebar navigation and project shortcuts share a 36px minimum row and
20px icons; touch navigation keeps a 44px minimum.

Desktop opens the most recent valid local project, with project authorization,
Agent readiness and the first message as its empty state. Web uses a public landing
page at `/` and opens remote projects at `/projects`;
account details live at `/account`. The landing header uses a compact account avatar
with the same account, settings and permission-filtered administration menu as the
sidebar. Its footer groups brand copyright with privacy and GitHub links. Local work remains available before login.
Public pages (landing, authentication, privacy) share one header, which gains a surface
only after scrolling, and may add texture: a masked neutral dot grid, framed surfaces
and abstract artwork built from tokens and Hugeicons. Artwork is `aria-hidden`, never
imitates real projects, sessions or statuses, and moves only on hover. The homepage
shows its content on first paint: a centered hero, the labelled example in an
application frame, a three-step overview, illustrated workspace links and the
connection band. Authentication and privacy pages may play one short load entrance;
nothing autoplays, loops or waits for scrolling to appear.
Remote actions offer contextual sign-in and return to the requested page. Web layouts also serve phone browsers.
The Expo iOS/Android app requires login by default and opens its account screen
after authentication. Native task views and push notifications are later work.

Desktop and Web share one sidebar order: Projects and the pending inbox, then project
shortcuts, then Automations and Memory above one fixed footer row for the account and
the settings shortcut. Use consistent 20px icons with 1.75 strokes, visible keyboard focus and
labelled tooltips in the collapsed rail; keep pending counts visible. Desktop separates
local projects, with bounded recent shortcuts and searchable expansion, from connected
computers, which appear only after sign-in. Guests get a direct sign-in action; the
account menu manages an existing account only.

The top bar carries page context through the shell toolbar slots. Project pages show
the project name and its Sessions, Files, References, Automations and Terminal tabs there;
remote projects expose only supported tools. Page actions and scope switches sit at the
end of the top bar instead of above page titles. The session editor consumes the chosen
computer/project without repeating selectors.

Forms have visible labels and errors, keyboard focus, sensible autocomplete and
pending-state controls. Empty and unavailable states explain real capabilities.
Theme and language follow the device by default and retain explicit local choices.
Respect reduced motion, narrow screens, long Chinese/English content and large fonts.

Authentication uses one centered, bordered panel with a 16px radius. Web keeps the
original logo and theme/language controls in a shared public header. At 1024px and
above, the panel caps at 60rem and pairs the form with existing product facts in a
quiet side region; narrower screens use one column and natural document scrolling.
The form caps at 25rem. Desktop uses a compact single-column panel inside its
native title-bar frame, with the return-to-workspace action above it. Applications
own panel padding; shared Auth owns only field rhythm and feedback. All five modes
share the same title, description, field, primary-action and footer hierarchy.
Successful password resets and verified email links replace the form with a clear
confirmation and next action. Invalid links offer recovery. Email-send states keep
the address and resend countdown visible; completion refresh retries do not repeat
credential submission. Password constraints, errors and visibility controls remain
grouped with the relevant field. These layouts use the same 44px controls in both
applications and retain password-manager autocomplete.

High-frequency controls respond immediately; color and focus transitions use the
shared 150ms control cadence. Menus and popovers enter in 150ms with ease-out and
small displacement; sheets may use 200ms. Animate state changes, not workbench page
sections or every arriving message; public pages follow the entrance rule above.
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

Application chrome composes the shadcn Sidebar, with a persistent icon rail on
narrow screens. Session workspaces pair a persistent composer and project-scoped drafts
with a session list and a separate detail column. Completed sessions lead with the
result and collapse the process. Overview counts describe the loaded
page; pending answers and running work are distinct. Use actual statuses, never
synthetic progress. Stack columns on narrow screens and focus the opened detail.

Terminal requests have a separate section from managed tasks. Load tool inputs only
on expansion; show waiting, decided, delivered and uncertain outcomes accurately.
Keep receipt identity on retry, hide expired actions and retain the processed item
when an answer succeeds. Use explicit project and Away opt-in in Desktop settings.

Web administration has its own /admin shell with Overview, Users, Site settings and
Audit log. A single console link leaves the personal workspace navigation uncluttered.
Use actual account aggregates and dependency observations, with explicit UTC dates
and independent unavailable states. Audit rows distinguish applied, rejected, failed,
in-progress and unconfirmed outcomes; change details never contain secrets.
