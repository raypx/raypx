# Product

## Users

People who need a consistent account and preferences across Web (including
phone browsers) and Desktop, with local files, recurring tasks and external tools on their own desktop.

## Product purpose

Raypx is an extensible application foundation. Web provides account and
preferences on desktop and phone browsers. Desktop also manages authorized local directories, scheduled
actions and interactive terminals through the bundled Raypx CLI.

## Principles

- Desktop local tools and Web browsing are available without login. Desktop asks for
  login when connecting computers, reading remote data or handling remote approvals.
- Web guests can browse the interface, change preferences and prepare task drafts.
  Private history, computer connections, task execution and approval actions require
  login. Return to the original page afterward and restore drafts without sending them.
- Local runtime state and device preferences survive account logout.
- New Desktop local tasks and drafts belong to the current device workspace, across
  login, account switches and logout. Legacy account-owned local data keeps its original
  server/account scope. Neither workspace is uploaded or merged automatically.
- Show real execution, permission failures and retry state. Never fabricate data.
- macOS Desktop Quit leaves the independent CLI daemon and Agent tasks running.
  Explicit logout/revoke cancels affected remote and legacy account work, preserving
  device-owned tasks. Daemon stop cancels owned work; Windows retains its
  foreground owner. Host/OS restart recovery remains a separate capability.
- Use stable package interfaces and add shared packages when real consumers need them.
- Memory and task templates have explicit device/account ownership and immutable versions.
  Tasks use only user-selected references and keep their captured context after later edits.
- Keep the original brand mark and neutral light/dark visual system.

## Scope

Email/password accounts, verification/reset, theme, English/Chinese, local files,
Cron automations and terminals. No old projects, tasks, research, AI providers,
cloud file delivery or general role management. Verified administrators can manage
site identity, registration and background cleanup in Web. Remote Agent tasks and approvals synchronize
between Web and opted-in hosts. macOS adds explicitly installed Claude/Codex
terminal hooks: per-project Away mode forwards validated Bash approvals to Web or
Desktop, and timeout/unavailability returns control to the terminal. Terminal
outputs and full session streams are not synchronized. This is a plaintext private
test feature until content protection is complete. Desktop also runs private local Agent
tasks directly through its bundled CLI. These tasks never upload to the account,
even when remote access is enabled. The local setup guide authorizes a project,
checks installed agent capabilities and opens the task editor without starting work.
