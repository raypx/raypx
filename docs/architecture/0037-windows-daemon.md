# ADR 0037: Windows uses the independent CLI daemon

Status: accepted, 2026-10-28. Supersedes the Windows foreground-owner rule in
ADR 0035 and ADR 0036.

macOS and Windows Desktop now share one execution model: Desktop launches
`raypx daemon proxy`, which connects to or starts the profile's independent
daemon. GUI Quit disconnects a client and never cancels daemon Agent tasks.
The foreground `raypx stdio` owner remains for direct CLI use but Desktop no
longer selects it.

## Transport

Bun cannot reliably serve HTTP on Windows named pipes, so the Windows daemon
listens on `127.0.0.1` with an OS-assigned port. `runtime/local-http.ts` owns
both transports; POSIX keeps owner-only Unix sockets.

- `daemon.json` records either `socket` or `port`, with the same bearer token and
  epoch. The profile directory under `%LOCALAPPDATA%` carries the user's ACL.
- Requests carrying `Origin`, or a `Host` other than `127.0.0.1:<port>`, are
  rejected before token checks, so browsers and DNS rebinding cannot reach it.
- Clients pass `proxy: false`: Bun otherwise sends loopback requests, including
  the token, through `HTTP_PROXY`.
- `RAYPX_LOCAL_TRANSPORT=tcp` selects loopback on POSIX for tests only.

## Executable lifetime

Windows locks running executables, so a daemon started from the Desktop bundle
would block the updater. A compiled CLI copies itself to
`<data>/Raypx/bin/raypx-<version>-<builtAt>.exe` and starts the daemon from there.
Each launch removes other unlocked copies. Desktop spawns CLI children with
`CREATE_NO_WINDOW`; the daemon is detached with a hidden window.

## Terminal hooks

The terminal hook host uses the same transport; `terminal-hook.json` records the
socket or port. Hook commands differ per Agent on Windows:

- Claude Code runs shell-form hooks through Git Bash, which consumes backslashes,
  so Raypx installs an exec-form hook (`command` is `raypx.exe`, `args` the rest).
- Codex runs hooks as `cmd /C "<command>"`, so every part is double-quoted; paths
  containing `"` or `%` are rejected. A Codex configured to run hooks through
  PowerShell cannot invoke a quoted path and is unsupported.
- `~/.raypx/bin/raypx.exe` is renamed aside before an upgrade because a running hook
  locks it; retired copies are pruned on later installs.

## Deferred

- `daemon install` (login autostart) remains macOS-only. Windows starts the daemon
  on demand from Desktop or `raypx daemon start`.
- Removing the foreground owner after the daemon is proven on Windows.
