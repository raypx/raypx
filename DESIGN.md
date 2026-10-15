# Raypx visual system

Keep original logos and icons. Use neutral light/dark semantic tokens, Base UI
for DOM primitives, Tailwind v4, Lucide icons and the existing system font stack.
Primary actions are dark on light backgrounds and light on dark backgrounds.

Web has a quiet account/settings shell. Desktop adds Files, Automations and
Terminal navigation without a login wall. Mobile uses Expo native controls and
Uniwind semantic theme tokens. It never imports DOM components or providers.

Forms have visible labels and errors, keyboard focus, sensible autocomplete and
pending-state controls. Empty and unavailable states explain real capabilities.
Theme and language follow the device by default and retain explicit local choices.
Respect reduced motion, narrow screens, long Chinese/English content and large fonts.
