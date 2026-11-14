# Desktop development

Desktop is a native host for the shared workspace. It launches its bundled CLI by
absolute path. It never imports CLI source. The renderer owns no Agent execution,
credentials or local administrative router.

## Startup and sign-in

The host starts one private daemon for the selected data directory and profile,
verifies its authenticated IPC identity and obtains finite native/renderer channel
capabilities. The loopback WebSocket requires its exact Origin and one-use token.
The native channel owns connector consent; the renderer cannot impersonate it.

System-browser sign-in uses explicit account consent, PKCE, state, issuer and
callback verification. The daemon verifies the current account before storing
cookies. Sign-out and account changes revoke the affected connector binding.
Native preferences and confirmed directories remain local. No enrollment identity,
Host authorization, profile transfer or old history import exists.

The remaining private SQLite file is `desktop-session.sqlite`: one
`desktop_sessions` table stores encrypted session material. This is session
transport, not conversation storage. The old `profile.sqlite` is never opened. Earlier sessions are not imported; sign in again.
OS key storage protects persistent sessions; when unavailable the bridge is
memory-only and makes that state visible. This dependency remains until a native
session replacement can preserve secure cookies, account isolation and the
bounded server event stream. Do not remove it independently of that replacement.

## Device connector

Pairing and each Space directory grant require local confirmation. Commands use
exact executable authorization or an addressed approval, plus current membership,
fences and grants. Closing the window leaves granted work running. See
[connector setup and limits](device-connector.md). Native Screen support is not
part of the device connector.

## Builds and verification

Use the pinned Bun runtime and `CGO_ENABLED=0`. `bun run build:cli` prepares one
production CLI. Its format-2 immutable inventory includes the executable,
`runtime.json`, license and README. It has no terminal helper payload. Signing
seals the CLI before archive/Desktop consumers use `RAYPX_CLI_PAYLOAD`; consumers
never compile implicitly or rewrite sealed files.

`bun run --cwd apps/desktop mygo:check` and `mygo:test` cover Go source and host
contracts. Setting `RAYPX_MYGO_CLI` to the absolute prepared executable enables the
real private-channel/session tests. `native:smoke` and
`native:smoke:interactive` are separate prepared-package gates. They do not prove
another operating system. Local automation uses private temporary homes and
owned processes. Packaged macOS/Windows and Linux acceptance remain separate.

## Connection configuration

Native Desktop reads `~/.raypx/config.toml`, or the explicitly isolated RAYPX_HOME,
at startup. Configure `base_url` and `web_url` for the API and Web origins and
restart after changing them. Origins isolate sessions and connector credentials;
changing an endpoint transfers no identity or history. Named native connection
profiles remain separate from the CLI's private local state directories.
