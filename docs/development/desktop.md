# Tauri Desktop

Runtime connection settings, native API transport and release requirements for
the Tauri web host. [Desktop workspace commands](../../apps/desktop/README.md)
and [ADR 0045](../architecture/0045-tauri-node-pnpm.md) define its entry points
and architectural boundary.

## Connection configuration

Every Desktop installation uses the same package. Native reads
`~/.raypx/config.toml` once at startup; Windows uses `%USERPROFILE%\.raypx\config.toml`.
The first launch creates the directory and a commented TOML template, defaulting
to `https://raypx.com`. Existing files are never overwritten. Public Web/API
build variables do not select the server for an installed Desktop.

An existing explicit `base_url`
continues to win: update it deliberately, then restart Desktop. Changing the
origin does not transfer an enrolled instance, saved session or remote grant.
Use a separate `local_profile` and register it for the new origin when required;
the previous profile and its local history remain on disk.

This follows the user-level TOML and named-configuration approach described in
[OpenAI's Codex configuration documentation](https://learn.chatgpt.com/docs/config-file/config-basic).
Raypx's supported parameters and profile-table syntax are defined below.

### One server

```toml
base_url = "https://beta.raypx.com"
```

Use a self-hosted Raypx origin in the same field. When Web and API share an origin,
this controls authentication, account reads, tasks, device registration, grant
renewal, relay WebSockets and account email callback links.

For a split deployment:

```toml
base_url = "https://api.example.com"
web_url = "https://app.example.com"
```

The server must implement the Raypx API/relay contract and allow `views://main`
as a trusted auth origin. HTTPS cookies retain their Secure/HttpOnly requirements.
See [self-hosted deployment](deployment.md). Switching endpoints does not deploy
or migrate a server.

### Named profiles

```toml
# Root fields must precede [profiles.*] tables in TOML.
profile = "beta"
base_url = "https://raypx.com"

[profiles.beta]
base_url = "https://beta.raypx.com"

[profiles.company]
base_url = "https://api.example.com"
web_url = "https://app.example.com"
```

Profiles are user-defined names, not release channels. Select one by changing
`profile`; omit it to use root defaults. Unknown profiles or unsupported options
are errors. Raypx's CLI `--profile` still selects its local SQLite profile and
does not select this Desktop connection. Desktop maps optional `local_profile`
(default `default`) to the bundled CLI `--profile`; it is independent of `profile`.
Set it to a new name and restart Desktop to explicitly register a new identity.
The old profile, history and file grants remain on disk.

| Parameter                  | Meaning                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `base_url`                 | API origin; defaults to `https://raypx.com`                                                         |
| `web_url`                  | Web origin for verification/password-reset links; defaults to `base_url`                            |
| `local_profile`            | Local CLI profile name, default `default` (1–64 letters/digits/`_`/`-`, starts with a letter/digit) |
| `profile`                  | Optional selected name in `profiles`                                                                |
| `profiles.<name>.base_url` | Overrides the root API origin                                                                       |
| `profiles.<name>.web_url`  | Overrides the Web origin for this profile                                                           |

A selected profile takes precedence over root defaults. If it overrides
`base_url`, an omitted profile `web_url` follows that new origin, rather than
inheriting a different server's Web URL. If it only overrides `web_url`, the
root API origin remains in use.

Origins cannot include credentials, subpaths, query strings or fragments.
HTTPS is required except for loopback HTTP (`localhost`, `127.0.0.1`, `[::1]`).
The file is limited to 16 KiB. It contains public connection settings only;
passwords, session cookies and provider credentials do not belong here.

An optional root `[ai]` table configures [Pi model calls](ai.md) in the bundled
CLI. It is independent of connection profiles; Desktop accepts the table and
the CLI validates its fields when an AI command runs. Keys remain in environment
variables, referenced by name in `api_key_env`.

### Apply and isolate

Quit Raypx from the tray/application menu and start it again after editing.
Closing the window only hides it and does not reload configuration. Invalid or
unreadable configuration stops startup with a native error dialog; Raypx does
not fall back to another server.

The normalized API origin scopes the Tauri page origin, native cookie partition,
remote opt-in and device binding; ports count as distinct origins. Switching back
restores that server's saved state. Theme/language and device-local CLI data stay
on the same computer. The CLI profile's account/origin binding remains immutable
after enrollment: connection profiles choose endpoints and never transfer identity.

Earlier versions did not scope their login/remote settings to a server. Those
unscoped sessions and opt-ins are not imported: sign in and enable remote tasks
again. Earlier unscoped local Agent history stays in SQLite and is not
automatically assigned to a deployment.

For isolated testing or a portable setup, `RAYPX_HOME` may name another absolute
configuration directory. It changes where `config.toml` is read, not the server
precedence. The GUI launched by Finder/Explorer may not inherit shell variables.
Native smoke tests always use their own temporary configuration directory.

Native HTTP on macOS and Windows keeps persistent Cookies in Rust-owned `tauri-sessions.sqlite`,
one row per server scope, isolated from the CLI profile database and Desktop instance lock.
POSIX directories/files use 0700/0600; Windows uses restricted inheritable DACLs,
including SQLite auxiliary files. Credentials never enter TOML, renderer storage or sync.
Old Keychain entries, `credentials.sqlite` and `session-v2.enc` files are not read, imported
or deleted. An old profile without its database key remains unavailable, with history and
file grants retained; choose a fresh `local_profile` explicitly. An expired or server-revoked session requires sign-in, and a missing Host authorization requires explicit authorization again.
Persistent cookies are AES-GCM ciphertext authenticated against their server scope;
the OS credential store keeps a separate key for the Tauri data directory. A missing
key or unreadable ciphertext preserves the stored rows and permits in-memory
sign-in. MyGo sessions stay untouched; the first Tauri launch requires sign-in. Session-only Cookies stay in memory; persistent
Cookies honor expiry and sign-out removal.

## Native API transport

The Rust host's `Api::rpc` calls account/get and hosts/authorize/revoke through the
same native HTTP adapter as renderer API requests. Business payloads stay opaque
JSON; TypeScript contracts remain authoritative.

`apiExposure` in `@raypx/contracts/api` assigns every procedure to renderer, native
or independent host access. `native:generate` derives the Rust RPC path policy;
Desktop check generates that policy without requiring renderer/CLI assets.
Packaging and native test preparation use the same generator. Native cookie and
credential isolation remains enforced by the Rust HTTP adapter.

The adapter enforces configured origin, allowlisted paths/headers, Origin:
`views://main`, request/response limits, deadlines, cancellation, redirect refusal
and atomic persisted Cookie batches. Host credentials never enter renderer replies.
The renderer cannot invoke hosts/authorize/revoke through native HTTP.

Requests use the oRPC JSON envelope. Current contracts represent dates as strings;
nonempty serialization metadata, blobs and maps are rejected. HTTP 401 maps to
AUTH_REQUIRED; recognized NOT_FOUND/FORBIDDEN/BAD_REQUEST errors preserve only
their fixed code. Server messages/data are not forwarded. A plain/malformed 404
maps to MISSING_PROCEDURE and authorization fails. The current hosts API is required;
there is no browser-grant fallback.
Redirects cannot become successful authorization responses.

Run `pnpm --dir apps/desktop run tauri:test` for shared policy fixtures, native
Cookie continuity, real TypeScript oRPC transport, private-method rejection and
session corruption/lock tests. Fixtures use ephemeral loopback endpoints and
synthetic data; they require no real accounts or provider login.

Native HTTP's `views://main` Origin differs from the scoped renderer URL
(`raypx-<server-scope>://localhost/`, mapped to HTTP on Windows). Framework changes
do not make arbitrary renderer origins trusted or expose native Cookies.

## Build and release

Node 24.22.2, pnpm 12.16.1, Rust 1.99.1 and Tauri 2.12.5 are pinned in root
package.json, rust-toolchain.toml and Cargo.lock. The npm Tauri CLI/API package
release is 2.12.4; Rust Tauri remains exactly 2.12.5. pnpm/VP owns JS builds and
caches; Cargo owns native compilation. `pnpm run package:desktop` stages the full
matching CLI distribution, signs nested executables, seals manifests and invokes
Tauri. Outputs live in `target/release/bundle`. Users need no global Node/pnpm.

macOS requires 13.5+ and a system WebView. Windows uses WebView2 and a per-user
NSIS installer. Linux Desktop remains unverified. Cross compilation is rejected
unless the complete matching CLI runtime is available. The main window uses
native decorations; application layout stays inside their content area.

`pnpm --dir apps/desktop run tauri:check` runs Cargo format/check/Clippy;
`tauri:test` runs native tests, including real children and SQLite locks. Linux
checks the core without GTK/WebKit; actual GUI compilation requires those native
libraries and does not itself establish GUI acceptance.
`tauri:check:docker` generates contracts then runs the core in a scoped Rust image.

Native smoke uses the Cargo `native-smoke` feature, a separate application ID,
renderer output and `target/native-smoke`. The authenticated private endpoint
requires a marked, owned temporary directory. Production packages contain no
smoke socket/eval controls. `pnpm exec tsx apps/desktop/scripts/host/check-release.ts`
inspects shipped host bytes and resource checksums.

`native:smoke` stays inactive; `native:smoke:interactive` also checks native
focus/resize/close on isolated macOS/Windows runners. The Windows hosted gate
installs/uninstalls the actual NSIS package and verifies every runtime file.
Live provider and Beta acceptance require their explicit isolated credentials.
Native input changes select the relevant platform runners. Routine renderer edits
keep source checks; releases additionally run `pnpm run verify --full`, packaged
native, database and browser acceptance.

Nested macOS Node/pnpm/CLI/Herdr binaries are signed before their checksum ledgers
are sealed and the outer app is signed/notarized. Windows signs PE resources and
the NSIS installer. Missing distribution credentials produce an unverified
artifact; they cannot establish signing, notarization or release acceptance.

The first Tauri release is a signed installer, retaining the existing application
identifier and data directories. Quit MyGo, explicitly stop its daemon through
the current CLI, and wait for lock release before switching. A mismatched daemon
is never silently taken over. Re-login affects online sessions only; preferences,
projects, task history, config, offline identity and existing remote consent remain.

Later updates require new `TAURI_SIGNING_PRIVATE_KEY`,
`RAYPX_TAURI_UPDATER_PUBLIC_KEY` and HTTPS `RAYPX_TAURI_UPDATER_URL`. Never reuse
the MyGo key/feed. Test packages receive no distribution keys or update endpoint.
Only publish an artifact after its platform's installer, GUI and signing matrix
passes. Record unavailable checks as unverified.
