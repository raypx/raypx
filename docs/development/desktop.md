# MyGo Desktop

Runtime connection settings, native API transport and release requirements for
the MyGo web host. [Desktop workspace commands](../../apps/desktop/README.md)
and [client boundaries](../architecture/clients.md) define its entry points.

## Renderer navigation

The packaged SPA uses hash history and opens `/agents` after sign-in. It shares
Space management, direct/group conversations, history paging, approvals, tool and
delegated activity, routines and memory with Web. `/pages` supports editing,
versions, restore and sharing; previews open Web instead of embedding authenticated
documents. `/join` handles invitation admission. Account settings include Models,
approval policy, Skills and Tools. Still working keeps outside-window active Runs
reachable with Stop, targeted steering, approvals and a trigger-page jump. Tools
shares Web's Space-owner OpenAPI import, operation/Agent selection, connection
testing and write-only credential management.

Settings opens over the current route, for example `#/agents#settings`, preserving
selection, search, mounted drafts and reading position. Close returns through the
matching history entry or clears only the settings fragment on a direct link.
Project/session editors, Waiting, Automations, project Files and Terminal are
removed from this renderer. The CLI/native capabilities behind those old screens
remain solely for retained consumers until their replacement phase.

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

### One server

```toml
base_url = "https://beta.raypx.com"
```

Use a self-hosted Raypx origin in the same field. When Web and API share an origin,
this controls authentication, Agent/Space RPC, `/events`, Page handoff and account
email callbacks, together with retained device registration and Relay transport.

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

The normalized API origin scopes the MyGo page origin, daemon cookie partition,
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

Persistent cookies live encrypted in `desktop_sessions` in the existing CLI
profile database. AES-GCM authenticates the profile directory and canonical API
origin. MyGo Secrets stores a new key under `raypx-desktop-session-v1-`, scoped to
both canonical native-data and CLI-profile directories. Native sends it only via
finite stdin and private daemon IPC; credentials never enter TOML or renderer
storage. Key creation is allowed only when the profile has no stored sessions.
Missing keys or unreadable ciphertext preserve rows and permit memory-only sign-in.
Each bootstrap retries an available native key. A temporary login or logout wins
over old stored cookies once the key validates; an incorrect key cannot overwrite
encrypted rows. A failed write disables that session transport until recovery.
Session-only cookies remain in memory; persistent cookies honor expiry and
sign-out. Unsupported formats fail without conversion.

Settings → Recover saved sign-in opens the native Retry / Reset / Cancel dialog.
Retry bootstraps again even when the engine is ready. Reset requires a second
confirmation and clears saved sign-ins for every server origin in this profile:
native saves a new key first, then the daemon transaction clears only its session
table, invalidates cached APIs and reboots the channel. Failures report failure
and can be retried. Projects, tasks, enrollment identity, preferences and the
independent Host authorization vault are preserved. A corrupt `host-session.json`
cannot restore cloud authority; normal account selection rewrites it while local
Desktop recovery remains available.

The previous Go session database, its key namespace and other historical credential
stores are never read, imported or deleted. Signed offline enrollment, device-owned
history, preferences and file grants survive logout. Account/origin changes revoke
the affected remote binding without transferring the profile.

## Desktop daemon channel

The private daemon channel remains the native session/transport boundary until
the device connector replacement phase. It does not own new server Runs.
Go launches the absolute version-matched CLI with finite `daemon desktop` bootstrap.
Administrative IPC stays private (Unix socket on POSIX; token-guarded loopback on
Windows). It returns a distinct narrow native capability; the administrative token
never leaves the CLI. Native retains windows, tray, OS dialogs, updates, preferences,
instance lock, directory grants, visibility and notification polling.

The renderer receives a one-use capability and connects directly to a separate
`127.0.0.1` WebSocket listener. Exact Host and the owned WebView/dev Origin are
required; `Origin: null` is rejected. Authentication is the first frame, with no
capability in the URL. Protocol, frames, pending work, event bytes and unacknowledged
sequence deadlines are bounded. Events use a one-MiB credit window; ACKs must
identify a sent stream/sequence and cover all earlier events after dispatch.
Disconnect, overflow, ACK timeout, binding expiry and rebootstrap release
HTTP requests and UI approval leases while accepted tools and PTYs keep running.
Native binding heartbeats expire after 20 seconds of awake time if the GUI
disappears; suspension does not retire a binding. Explicit GUI Quit stops that
native owner's tools and terminals across all origins, using
management IPC if the binding has expired. The native Quit dialog checks active
local and remote Agent tasks in the current daemon profile. It offers keeping
them running in the background, stopping the checked tasks and quitting, or
cancelling Quit. The stop confirmation is single-use and tied to the native
binding. Tasks that start after the check continue independently. If the check is
unavailable, the user can quit and leave work running or stay in Desktop.

Execution ownership combines native owner, origin and enrolled identity. Renderer
queries and process control cannot select or cross that scope. Switching origin
preserves old processes; switching back restores their control. `execution_list`
returns summaries, `execution_result` reads a retained tool result, and
`terminal_restore` sends Herdr's current screen plus bounded history (1,000 lines,
4 MiB). Completed results retain at most 64 entries / 8 MiB, with explicit errors
after eviction. Retained terminal clients can restore the current screen through that protocol;
the current Desktop renderer has no Terminal page. Input and execution
commands are never automatically resent; daemon restart does not rerun them.

Bootstrap is serialized and validates runtime/session preparation before retiring
the old binding. Native also retains its previous descriptor on failure. Directory
registration has a 30-second context, ordinary control four seconds and Quit
release two seconds. Business errors, caller cancellation and deadlines preserve
host availability; transport failures and refused capabilities change it. Idle
persisted origin APIs are evicted; memory-only sign-ins are retained until
recovery, logout or daemon exit.
Event fan-out encodes once and queues the final frame with its UTF-8 byte size;
the 8 MiB budget includes the complete envelope and keeps exact ACK semantics.

Signing in or up clears the page's verified account without detaching the daemon;
explicit sign-out or a different verified account revokes the Host binding.

The daemon derives renderer method admission from `localResults` and RPC admission
from `apiExposure`, which is generated from each procedure's declared consumer.
A procedure without a declaration is denied by the Desktop proxy. Account
verification and Host authorization use its cookie API.
It enforces selected-origin paths/headers, `Origin: views://main`, request/response
limits, deadlines, cancellation, redirect refusal and atomic cookie persistence.
Cookies, Set-Cookie and restricted Host credentials never enter renderer replies.
Auth-body tokens are redacted. oRPC serializer metadata is rejected; safe fixed
error codes replace private server messages. Go owns no API proxy, cookie jar,
session database or acknowledged event queue.

CLI's Desktop suites cover the actual oRPC serializer, synthetic HTTPS persistence,
SQLite/key isolation, account races and loopback lifetime. Go tests cover finite
subprocess/IPC, OS locks and explicit compiled CLI integration. Packaged WKWebView
and WebView2 Origin/mixed-content, OS vault, tray and GUI behavior remain separate
platform acceptance gates; headless success does not establish those results.
The gateway's real PTY lifetime matrix runs when `RAYPX_HERDR_BINARY` and
`RAYPX_CLI_BINARY` point at an inventory-verified prepared payload; otherwise those
seven cases are skipped. `RAYPX_HERDR_COMPILED=1 bun run --cwd apps/cli smoke:herdr-terminal`
also checks bounded history, current-screen restoration, resumed input and
descendant cleanup using the prepared CLI helpers.

## Build and release

Bun 1.4.4 owns renderer and compiled CLI builds. Go 1.27.3 owns the MyGo v0.8.3 host,
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
smoke listener or eval controls. Go fixtures cover configuration and native lifetime; CLI owns the cookie/API/local
policy vectors. A compiled Bun fixture also exercises the actual preload.

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
activates a window. On macOS, physical pointer events pass through the visible
test window while private IPC drives its WebView. Interactive smoke belongs on
isolated CI.

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
persistence, server-isolated WebView storage, sleep/wake reconnect, daemon task
survival after GUI Quit, real account/provider flows, and distribution signatures.
Local headless results do not count as platform GUI or signing acceptance.

The pinned packager uses a small local packager adapter owned by
apps/desktop/scripts/host/packager.ts. The prepare job signs CLI/Herdr and reseals
their inventories once. The adapter prevents resource re-signing and recursive
outer signing from modifying this shared payload while packaging the host,
installer and update archive. Each staged payload is verified against the prepare
artifact; runtime never rewrites the manifest.
The Go module cache is untouched. Changes to MyGo's signing boundaries fail closed
until this adapter is reviewed. The pinned CLI sources are copied into a versioned directory under `.mygo/packager`.
Remove the adapter when upstream provides this hook.

See the [single-compile distribution and Strobe acceptance guide](mygo-bun-migration-plan.md) for prepared payloads and remaining platform gates.

## Space device computers

The new outbound-only `device` connector is separate from the retained daemon
channel above. Server Agents use session/Space admission without retained instance
enrollment. Desktop starts the absolute bundled CLI for finite pairing/grant
prepare and one-use confirmation; OS dialogs default to Cancel. A bounded native
heartbeat poll consumes a pending directory request only for the current freshly
verified account and configured origin, checks again before/after confirmation
and uses the native picker. Logout/session switching cannot grant a stale request.
No connector secret enters the renderer or the Go host. The connector continues
independently of the window; native UI acceptance remains a packaged platform gate.
See [device setup and platform limits](device-connector.md).
