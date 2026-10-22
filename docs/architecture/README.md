# Architecture

Workspaces are discovered from the root Bun workspace patterns. Applications are
composition roots; libraries expose explicit source entries; tooling remains out
of runtime dependency graphs. Manifests are the only workspace inventory.

## Applications

Web is a TanStack Start SSR application on Nitro node-server. Desktop uses the same DOM components in
an Electrobun WebView, with a native bridge to its version-matched bundled CLI.
Desktop builds with TanStack Start SPA mode: file routes, and a text-free root
shell prerendered to index.html. It has no server, so no server functions.
Desktop resolves the account session before mounting its workspace. Signed-out
sessions open a standalone login page; signup, verification and password recovery
remain accessible. Web keeps its existing public navigation. The CLI engine and
persisted local state remain independent of this renderer gate.
Phones use Web; the Expo mobile app was removed on 2026-10-18 until native
capabilities such as reliable push or share targets are needed. API uses Vite + Nitro + Hono + oRPC, deployed
on Node 24.15.0 with the node-server preset. CLI compiles with Bun 1.4.4.

Web and API are separate services. Their default Node outputs and optional
Cloudflare Worker outputs run outside the repository. See [dual deployment targets](../development/cloudflare.md).
API Nitro owns one listener and shutdown. One Hono Fetch app mounts /api/auth/_,
/rpc/_ and /health; everything else is a JSON 404. Web renders on the server with
device preferences from cookies/Accept-Language and the account from account.get,
forwarding only Better Auth cookies. It never imports API, auth server or DB code.
Its server must receive the session cookie: share one origin, or set AUTH_DOMAIN
to the parent domain of sibling Web/API hosts.

## Libraries

Auth exports server/client/hooks/types. Its platform-neutral React hooks
share authentication actions and request state across Web and Desktop.
The browser `/client` entry exports both `createAuthClient` and the shared DOM
`AuthForm`, composed from those hooks, UI primitives and i18n. Web and Desktop
inject clients, callback origins, query data and navigation adapters. Applications
own routing and session refresh; `/server` never imports the DOM form.
API creates the DB adapter and mailer and injects them; auth never imports their
concrete packages. Account and remote task/device/approval contracts are exposed
through RPC; local execution methods are never registered directly. The account safe
projection is { id, email, name }.

Account provides platform-neutral remote read state, browser account views and an
injected server projection service. API supplies fresh session resolution and
maps unauthorized responses; Web/Desktop supply navigation and auth actions.
Auth and client do not depend on account. Shared feature styles live with their
packages. Blocks composes UI and i18n into router-agnostic application chrome (the
sidebar shell and settings page sections) that Web and Desktop fill with their own
links and feature views; it never imports account, auth, tasks or analytics.
ThemePicker belongs to UI's `themes` entry, and LanguageSelect to i18n's browser entry.

Contracts/api contains oRPC definitions; contracts/local contains Zod device
messages. Client is the remote SDK. Local interfaces are never registered on
public RPC. UI contains DOM components, a `themes` entry and a pure `themes/config` entry.
I18n contains static English/Chinese catalogs and platform adapters. Its controlled
Raypx Kit provider delegates translation, formatting and React context to its bundled use-intl.
Only `useLanguagePreference().setPreference()` changes the product language
preference; the active locale is derived from that preference and the full ordered
system locale list. See [internationalization](internationalization.md).
DB owns fresh auth-only schema/migrations; mail owns auth delivery/templates.

## Browser analytics

Web and Desktop use the consent-controlled Kit analytics client through Raypx's
private product adapter. Statistics and sanitized error reports are independently
opt-in. See [analytics](analytics.md) for data boundaries, build configuration and
source-map publication. This does not replace API/CLI structured logging.

## Logging

API and CLI use `@raypx-kit/logger`, which exposes evlog directly. Each
composition root calls `initLogger` once per process (once per isolate on Workers)
and creates event loggers with `createLogger`; event data is added through `set`
and `error`, then completed with `emit`. Every drained event first passes
`withEventPolicy` from `@raypx-kit/logger/safe`: only the app's listed fields
(`API_LOG_FIELDS`, the CLI field list) and the fixed envelope leave the process,
sensitive values are replaced and errors keep only a name and code. API buffers
events in a bounded drain pipeline; the CLI and Node API write JSON lines to
stderr, and Workers write them to the console. Applications own environment
parsing, permitted fields, output and shutdown.

Only explicitly allowed fields and safe error summaries reach the drain.
Credentials, cookies, tokens, request bodies, command arguments, filesystem paths
and file or task output are not diagnostic fields. Arbitrary error messages,
stacks and causes must not pass through as event data.

API logs non-RPC HTTP requests through Hono and RPC calls through the official
`@orpc/evlog` adapter. Their scopes are mutually exclusive so one RPC invocation
does not also produce a Hono completion event. Request and operation identifiers
support correlation without exposing request payloads or changing safe API
error responses. The runtime drain enqueues events without waiting for the sink,
so a slow diagnostic destination does not delay an RPC response. Explicit
`flush` and `close` wait for queued delivery; Nitro owns draining pending log
writes during shutdown.

CLI diagnostics use the logger's `/node` stderr drain; stdout remains reserved
for human command results or the Desktop NDJSON protocol. CLI shutdown flushes
pending diagnostics without adding records to protocol output. Runtime and
packaged-platform acceptance remain separate verification gates.

An unpublished library archive may be tracked under `vendor/` for a reproducible
review branch, with source provenance, an archive checksum and the lockfile.
Provenance records either a clean source commit or the base commit, explicit
uncommitted state and per-file source checksums. The archive must be replaced by
an exact published alpha before merging. See
[Raypx Kit library changes](../development/intl-release.md) for archive checks and
the publication gate.

## Device runtime

The same CLI runtime handles human commands and Desktop NDJSON requests. Desktop
never imports CLI source. An explicit citty command tree handles the existing
JSON-parameter commands and scoped help. Global options are validated before
dispatch; operands after `--` stay positional. Raypx owns errors, output and
shutdown instead of citty's `runMain`. Help/version do not open a profile;
they retain the executable's diagnostic completion lifecycle.
`raypx tui` adds a lazy line-oriented task browser with a session-owned in-process
runtime and scheduling disabled. It shares the local request boundary, confirms
manual execution, and closes its own runtime on quit/EOF/signals. Both input and
output must be terminals; scripts keep using explicit commands and JSON. This
lightweight entry precedes the proposed host/owner protocol and full-screen TUI.
Files use canonical root grants, relative paths,
symlink/traversal checks, bounded UTF-8 and atomic writes. Delete requires confirmation.
External commands use executable + argv + cwd, with shell use explicit; they retain
normal OS permissions. PTY output is bytes encoded as base64; dates are ISO strings.

SQLite stores profiles, roots, schedules and bounded run history. A profile has
one scheduling owner and per-job execution locks. Cron uses five fields and an
IANA zone, skips missed triggers, and never retries interrupted commands on restart.
Tray runtime owns scheduling; explicit Quit/EOF cancels managed work. Local state
and theme/locale preferences survive account logout.
Files uses route search for directory/pagination, a scoped Zustand store for
unsaved UI state, and route loaders for native reads. Root grants are shared at
the local route boundary. Only the file table suspends while its listing reloads.

## Extension

See [workspaces](../development/workspaces.md). Keep testing/runtime modules at
their current owners until a second actual consumer justifies extraction.

Desktop also persists validated theme/language preferences in an atomic native
file and restores them before renderer scripts. WebKit custom-scheme localStorage
alone is insufficient across full process restarts. This storage is independent
of the CLI so preferences remain usable if the local engine is unavailable.

## Remote Agent tasks

[Remote tasks and approvals](remote-tasks.md) describes opted-in Desktop execution,
account-scoped device grants and Relay + Replay synchronization over outbound
WebSockets. The shared tasks feature owns browser views; API routes commands and
stores read projections. Desktop/CLI owns execution, approvals and terminal state,
with a durable sequenced journal for reconnect replay and snapshot recovery.
