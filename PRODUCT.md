# Product

## Users

People who need a consistent account and preferences across Web (including
phone browsers) and Desktop, with local files, recurring tasks and external tools on their own desktop.

## Product purpose

Raypx is an extensible application foundation. Web provides account and
preferences on desktop and phone browsers. Desktop also manages authorized local directories, scheduled
actions and interactive terminals through the bundled Raypx CLI.

## Principles

- Desktop opens its login page before showing the workspace; Web remains accessible without login.
- Local runtime state and device preferences survive account logout.
- Show real execution, permission failures and retry state. Never fabricate data.
- Closing the window keeps tray scheduling; explicit Quit stops managed processes.
- Use stable package interfaces and add shared packages when real consumers need them.
- Keep the original brand mark and neutral light/dark visual system.

## Scope

Email/password accounts, verification/reset, theme, English/Chinese, local files,
Cron automations and terminals. No old projects, tasks, research, AI providers,
cloud file delivery, roles or admin. Remote Agent tasks and approvals synchronize
between Web and opted-in Desktop devices; existing terminal sessions and full
terminal streams are outside this release. Desktop also runs private local Agent
tasks directly through its bundled CLI. These tasks never upload to the account,
even when remote access is enabled; the Desktop login requirement remains.
