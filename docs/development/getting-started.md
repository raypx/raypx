# Development

Use Bun 1.4.3 and Node 24.15.0. macOS/Linux can use nix develop; Windows uses
native runtime installs. Nix supplies Git and PostgreSQL 17 client tools, with no
services or product launch tasks. Run normal Bun scripts inside the shell.

Copy .env.example to .env; .env.local has priority, inherited shell values win.
Only development/build/env commands load files; tests provide explicit environment.
Start the separate compose database on 5433, then bun run db:migrate and bun run dev.
Never point these migration commands at the retired database or volume.

bun run dev starts Web/API. bun run dev:desktop starts Desktop development;
bun run desktop:build packages it with its version-matched CLI. bun run dev:mobile
starts Expo. Mobile first phase validates JS bundles without installing Xcode/Android.

Bun catalogs hold third-party versions. All React versions follow Expo's compatible
19.2.3 baseline. Voidmix stays external. Do not add another task runner or invoke
production API through Bun; its startup is Node .output/server/index.mjs.

Actual verification/reset emails require RESEND_API_KEY and MAIL_FROM. Without a
configured mail transport those actions return MAIL_NOT_CONFIGURED instead of
claiming delivery. Tests inject an explicit in-memory mail transport.

Bun uses a hoisted install layout so Expo native modules and React have one
physical instance. Policy still checks every declared production import. Expo
Doctor invokes read-only npm explain; its wrapper scopes npm_config_force to that
diagnostic process so the Bun-only install guard remains active for normal commands.
