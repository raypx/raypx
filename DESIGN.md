# Raypx visual system

Keep original logos and brand artwork. Use neutral light/dark semantic tokens, Base UI
for DOM primitives, Tailwind v4, Hugeicons Free through `@raypx/icons` and the existing system font stack.
Primary actions are dark on light backgrounds and light on dark backgrounds.
Express feature styles and responsive states with Tailwind utilities in components.
CSS entry points register sources and shared styles; avoid feature-specific selectors.

Desktop opens the most recent valid local project, with project authorization,
Agent readiness and the first message as its empty state. Web uses a public landing
page at `/` and opens remote projects at `/projects`;
account details live at `/account`. The landing header uses a compact account avatar
with the same account, settings and permission-filtered administration menu as the
sidebar. Its footer groups brand copyright with privacy and GitHub links. Local work remains available before login.
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
