# Raypx visual system

Keep original logos and icons. Use neutral light/dark semantic tokens, Base UI
for DOM primitives, Tailwind v4, Lucide icons and the existing system font stack.
Primary actions are dark on light backgrounds and light on dark backgrounds.
Express feature styles and responsive states with Tailwind utilities in components.
CSS entry points register sources and shared styles; avoid feature-specific selectors.

Desktop opens the most recent valid local project, with project authorization,
Agent readiness and the first message as its empty state. Web opens remote projects;
account details live at `/account`. Local work remains available before login.
Remote actions offer contextual sign-in and return to the requested page. Web layouts also serve phone browsers;
the planned Expo iOS app is a separate delivery phase.

The sidebar concentrates on projects and the global pending inbox.
Account and settings stay at the bottom. Use consistent 20px Lucide icons, visible
keyboard focus and labelled tooltips in the collapsed rail; keep pending counts visible.
Desktop separates local projects from connected computers, with bounded recent
shortcuts and searchable expansion. Project headers provide Sessions, Files,
References, Automations and Terminal; remote projects expose only supported tools.
The session editor consumes the chosen computer/project without repeating selectors.
The account menu and settings shortcut share one fixed footer row.

Forms have visible labels and errors, keyboard focus, sensible autocomplete and
pending-state controls. Empty and unavailable states explain real capabilities.
Theme and language follow the device by default and retain explicit local choices.
Respect reduced motion, narrow screens, long Chinese/English content and large fonts.

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
