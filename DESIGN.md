# Raypx visual system

Keep original logos and icons. Use neutral light/dark semantic tokens, Base UI
for DOM primitives, Tailwind v4, Lucide icons and the existing system font stack.
Primary actions are dark on light backgrounds and light on dark backgrounds.
Express feature styles and responsive states with Tailwind utilities in components.
CSS entry points register sources and shared styles; avoid feature-specific selectors.

Web has a quiet account/settings shell. Desktop adds Files, Automations and
Terminal navigation available before login. The local setup guide uses three inline
steps: project authorization, agent readiness and opening the task editor. Remote
actions offer contextual sign-in and return to the requested page. Task views default to This
computer, with a separate Connected computers tab for remote tasks. Web layouts also serve phone browsers;
the planned Expo iOS app is a separate delivery phase.

Sidebar task navigation comes first, with local tools in a separate Desktop group.
Account and settings stay at the bottom. Use consistent 20px Lucide icons, visible
keyboard focus and labelled tooltips in the collapsed rail; keep pending counts visible.

Forms have visible labels and errors, keyboard focus, sensible autocomplete and
pending-state controls. Empty and unavailable states explain real capabilities.
Theme and language follow the device by default and retain explicit local choices.
Respect reduced motion, narrow screens, long Chinese/English content and large fonts.

Application chrome composes the shadcn Sidebar, with a persistent icon rail on
narrow screens. Task workspaces pair a persistent composer and device-only drafts
with a task list and a separate detail column. Overview counts describe the loaded
page; pending answers and running work are distinct. Use actual statuses, never
synthetic progress. Stack columns on narrow screens and focus the opened detail.

Terminal requests have a separate section from managed tasks. Load tool inputs only
on expansion; show waiting, decided, delivered and uncertain outcomes accurately.
Keep receipt identity on retry, hide expired actions and retain the processed item
when an answer succeeds. Use explicit project and Away opt-in in Desktop settings.
