# Tauri Desktop

The canary Desktop uses Tauri 2.12.5 and Rust 1.99.1 for the native host and a
React SPA for the client. Execution and scheduling belong to the independent
TypeScript CLI/daemon, whose executable embeds stable Bun 1.4.4 with minified ESM
and depth-0 bytecode. This guide covers connection settings, native API transport
and release requirements. [Desktop workspace commands](../../apps/desktop/README.md)
and [current architecture](../architecture/README.md) define its entry points
and architectural boundary.

## Renderer navigation

Desktop uses History paths for its main pages. The scoped local protocol resolves
embedded assets through Tauri 2.12.5's asset resolver, whose existing `index.html`
fallback supports reloading a deep path such as `/files`. Development uses Vite's
SPA fallback; the native host adds no second routing or rewrite layer.

Settings opens as `#settings` on the current path and query. The underlying page
stays mounted, retaining its project, selections and drafts while the dialog is
open. Closing returns to the matching background history entry, or removes only
the fragment when opened from a direct link. Native smoke checks a packaged
deep-path reload and that opening Settings retains the current page and URL.

The Terminal tool opens the daemon's default shell in the current project's
directory after an explicit click. Advanced options allow a custom executable,
JSON argument array and directory. With no project selected, the directory must
be entered explicitly. The daemon verifies absolute executable paths and chooses
its default from a usable `SHELL` or Windows `ComSpec`, with a verified system
fallback. External commands run with the operating system user's permissions;
file grants constrain the built-in file operations.

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

For isolated testing or a portable setup, `RAYPX_HOME` may name another absolute
configuration directory. It changes where `config.toml` is read, not the server
precedence. The GUI launched by Finder/Explorer may not inherit shell variables.
Native smoke tests always use their own temporary configuration directory.

Native HTTP on macOS and Windows keeps persistent Cookies in Rust-owned `tauri-sessions.sqlite`,
one row per server scope, isolated from the CLI profile database and Desktop instance lock.
POSIX directories/files use 0700/0600; Windows uses restricted inheritable DACLs,
including SQLite auxiliary files. Credentials never enter TOML, renderer storage or sync.
Only the current session store is opened; there is no automatic data import.
A local profile without its database key remains unavailable, retaining its history
and file grants. Choose a fresh `local_profile` explicitly if a new identity is needed. An expired or server-revoked session requires sign-in, and a missing Host authorization requires explicit authorization again.
Persistent cookies are AES-GCM ciphertext authenticated against their server scope;
the OS credential store keeps a separate key for the Tauri data directory. A missing
key or unreadable ciphertext preserves the stored rows and permits in-memory
sign-in. Session-only Cookies stay in memory; persistent Cookies honor expiry and
sign-out removal.

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

Run `bun run --cwd apps/desktop tauri:test` for shared policy fixtures, native
Cookie continuity, real TypeScript oRPC transport, private-method rejection and
session corruption/lock tests. Fixtures use ephemeral loopback endpoints and
synthetic data; they require no real accounts or provider login.

Native HTTP's `views://main` Origin differs from the scoped renderer URL
(`raypx-<server-scope>://localhost/`, mapped to HTTP on Windows). Framework changes
do not make arbitrary renderer origins trusted or expose native Cookies.

## Build and release

Bun 1.4.4 owns installation, scripts, renderer and standalone CLI builds.
Rust 1.99.1 and Tauri 2.12.5 are pinned in rust-toolchain.toml and Cargo.lock;
the independently released JavaScript CLI/API packages are 2.12.4. VP owns JS
builds/caches and Cargo owns native compilation.

Build the CLI once with `bun run build:cli`. Set `RAYPX_CLI_PAYLOAD` to its absolute
payload directory when reusing a prepared build. `bun run package:desktop`
verifies its platform, architecture, application version and integrity inventory,
copies it unchanged and invokes Tauri. Outputs live in `target/release/bundle`.
The production payload contains embedded Bun, bytecode, Herdr and its resources;
Desktop does not require a separate CLI installation or global JavaScript runtime.
Project commands use the user's installed tools.

macOS requires 13.5+ and a system WebView. Windows uses WebView2 and a per-user
NSIS installer. Linux Desktop remains unverified. Native packaging rejects a target that differs
from the build process's platform and architecture. Each target needs its own
matching prepared CLI payload. The main window uses
native decorations; application layout stays inside their content area.

`bun run --cwd apps/desktop tauri:check` runs Cargo format/check/Clippy;
`tauri:test` runs native tests, including real children and SQLite locks. Linux
checks the core without GTK/WebKit; actual GUI compilation requires those native
libraries and does not itself establish GUI acceptance.
`tauri:check:docker` generates contracts then runs the core in a scoped Rust image.

Native smoke uses the Cargo `native-smoke` feature, a separate application ID,
renderer output and `target/native-smoke`. The authenticated private endpoint
requires a marked, owned temporary directory. Production packages contain no
smoke socket/eval controls. `bun apps/desktop/scripts/host/check-release.ts`
inspects shipped host bytes and resource checksums.

`native:smoke` stays inactive; `native:smoke:interactive` also checks native
focus/resize/close on isolated macOS/Windows runners. The Windows hosted gate
installs/uninstalls the actual NSIS package and verifies every runtime file.
Live provider and Beta acceptance require their explicit isolated credentials.
Native input changes select the relevant platform runners. Routine renderer edits
keep source checks; releases additionally run `bun run verify --full`, packaged
native, database and browser acceptance.

Nested macOS CLI/Herdr binaries are signed before their checksum ledgers
are sealed and the outer app is signed/notarized. Windows signs PE resources and
the NSIS installer. Missing distribution credentials produce an unverified
artifact; they cannot establish signing, notarization or release acceptance.

Before replacing an installation, quit Desktop, explicitly stop its daemon and
wait for lock release. A mismatched daemon is never silently taken over. Installing
an update preserves local preferences, projects, task history, configuration and
offline identity; account/origin bindings remain fixed.

Signed updates require `TAURI_SIGNING_PRIVATE_KEY`,
`RAYPX_TAURI_UPDATER_PUBLIC_KEY` and an HTTPS `RAYPX_TAURI_UPDATER_URL` for this
application. Test packages receive no distribution keys or update endpoint.
Only publish an artifact after its platform's installer, GUI and signing matrix
passes. Record unavailable checks as unverified.
