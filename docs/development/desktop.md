# MyGo Desktop

Runtime connection settings, native API transport and release requirements for
the MyGo web host. [Desktop workspace commands](../../apps/desktop/README.md)
and [ADR 0038](../architecture/0038-mygo-desktop-host.md) define its entry points
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

The normalized API origin scopes the MyGo page origin, native cookie partition,
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

Native HTTP on macOS and Windows keeps persistent Cookies in Go-owned `mygo-sessions-v3.sqlite`,
one row per server scope, isolated from the CLI profile database and Desktop instance lock.
POSIX directories/files use 0700/0600; Windows uses restricted inheritable DACLs,
including SQLite auxiliary files. Credentials never enter TOML, renderer storage or sync.
Old Keychain entries, `credentials.sqlite` and `session-v2.enc` files are not read, imported
or deleted. An old profile without its database key remains unavailable, with history and
file grants retained; choose a fresh `local_profile` explicitly. An expired or server-revoked session requires sign-in, and a missing Host authorization requires explicit authorization again.
Persistent Cookies are AES-GCM ciphertext authenticated against their server scope;
MyGo Secrets keeps the data-directory key in the system credential store. A missing
key or unreadable ciphertext preserves the stored rows and permits in-memory
sign-in. Upgrading the previous plaintext session format clears those old rows
and requires sign-in again. Session-only Cookies stay in memory; persistent
Cookies honor expiry and sign-out removal.

## Native API transport

The Go host's `API.RPC` calls account/get and hosts/authorize/revoke through the
same native HTTP adapter as renderer API requests. Business payloads stay opaque
JSON; TypeScript contracts remain authoritative.

`apiExposure` in `@raypx/contracts/api` assigns every procedure to renderer, native
or independent host access. `native:generate` derives the Go RPC path policy;
Desktop check verifies its tracked output without requiring ignored build assets.
Packaging and native test preparation use the same generator. Native cookie and
credential isolation remains enforced by the Go HTTP adapter.

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

Run `bun run --cwd apps/desktop mygo:test`. The Go tests launch the actual oRPC 2
TypeScript router in tests/native/fixtures/orpc-server.ts with the pinned Bun,
on an ephemeral loopback port. They verify Cookie continuity, native credentials,
account/authorize/revoke calls, status-less errors, missing procedures, redirect
refusal and unsupported metadata. No GUI, database or provider login is needed.
Loopback protocol checks do not establish production HTTPS persistence acceptance.

The native HTTP Origin is intentionally distinct from the MyGo renderer URL
(`mygo://<server-scope>/`, mapped to HTTP on Windows). Changing the host framework
does not make renderer origins trusted API callers or expose session cookies.

## Build and release

Bun 1.4.4 owns renderer and compiled CLI builds. Go 1.27.3 owns the MyGo v0.7.4 host,
built with CGO_ENABLED=0. `bun run package:desktop` stages frontend/manifests,
version-matched standalone CLI and the complete Herdr runtime, then invokes the
pinned MyGo packager. Outputs live under `apps/desktop/build/<os>-<arch>`.
No separately installed Bun or Node is needed at runtime. The bundled CLI includes
Bun, so removing a user-level JavaScript installation does not change compatibility.

### Platform baseline

`mygo.config.ts` sets `mac.minimumSystemVersion` to `13.5`, consistent with the
pinned Go 1.27.3 host and Bun 1.4.4 CLI. macOS 12 is outside this configuration.
Windows uses the system WebView2 runtime. Linux CLI/source checks do not establish
Linux Desktop support. Cross-platform packaging is currently rejected: build on
the target platform/architecture with matching CLI and Herdr payloads.

These are configured requirements, not evidence of testing every OS version.
Release acceptance must record the actual OS, architecture, signing state and
installed artifact tested.

### Build and acceptance

MyGo v0.7.2 and later disable page pinch zoom and swipe navigation by default.
Desktop keeps these defaults; enable `PageOptions.PinchZoom` or
`PageOptions.SwipeNavigation` explicitly if a future page needs those gestures.

Native smoke uses the separate `native_smoke` Go build tag and token-authenticated
Unix socket or Windows named pipe to drive TS assertions. Production contains no
smoke listener or eval controls. Shared Go JSON fixtures cover configuration,
Cookies, API and local methods; a Bun fixture also exercises the actual preload.

Production MyGo builds omit the native UI inspector. After packaging run
`bun apps/desktop/scripts/host/check-release.ts`: it checks the actual host's
Go module/build metadata and rejects embedded native-smoke controls or renderer
hooks. The headless `mygo:smoke` checks the embedded frontend and matching CLI;
it does not validate a running WebView.

Native input changes select Go policy/transport and compiled Herdr on the relevant
platforms; renderer changes and shared JS dependency updates use daily source checks.
Full release preparation uses `bun run verify --full`. Distribution is selected
only for a tag or explicit `distribution` request. Packaging and installed native
GUI smoke run separately on macOS and Windows. Smoke uses a separate identity,
Go build tag, renderer output and temporary profile; Windows hosted runners verify
real per-user NSIS install/uninstall and payload hashes. Quiet local smoke never
activates a window. Interactive smoke belongs on isolated CI.

macOS signing uses APPLE_SIGNING_IDENTITY and a temporary imported keychain.
When complete Apple credentials are available, CI creates RAYPX_NOTARY_PROFILE
for MyGo notarization and verifies the stapled result. Windows CI imports the PFX
and passes its thumbprint to MyGo's signtool command. Missing credentials produce
unsigned/ad-hoc packages and are reported as such.

Signed MyGo updates require MYGO_UPDATER_PRIVATE_KEY,
RAYPX_MYGO_UPDATER_PUBLIC_KEY and an HTTPS RAYPX_MYGO_UPDATER_URL. MyGo generates
its own update archives/manifests. Configure the public key and HTTPS feed
together and verify the update with the actual packaged application.

Before a public release, verify installed-app upgrade, SQLite credential/session
migration, server-isolated WebView storage, sleep/wake reconnect, daemon task
survival after GUI Quit, real account/provider flows, and distribution signatures.
Local headless results do not count as platform GUI or signing acceptance.

The pinned packager uses a small local packager adapter owned by
apps/desktop/scripts/host/packager.ts. The prepare job signs CLI/Herdr and reseals
their inventories once. The adapter prevents resource re-signing and recursive
outer signing from modifying this shared payload while packaging the host,
installer and update archive. Each staged payload is verified against the prepare
artifact; runtime never rewrites the manifest.
The Go module cache is untouched. Changes to MyGo's signing boundaries fail closed
until this adapter is reviewed. The pinned CLI sources are copied into the ignored .mygo/packager directory.
Remove the adapter when upstream provides this hook.

See the [single-compile distribution and Strobe acceptance guide](mygo-bun-migration-plan.md) for prepared payloads and remaining platform gates.
