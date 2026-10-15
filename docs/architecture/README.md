# Architecture

Workspaces are discovered from the root Bun workspace patterns. Applications are
composition roots; libraries expose explicit source entries; tooling remains out
of runtime dependency graphs. Manifests are the only workspace inventory.

## Applications

Web is a React/Vite/TanStack Router SPA. Desktop uses the same DOM components in
an Electrobun WebView, with a native bridge to its version-matched bundled CLI.
Mobile uses Expo Router and Uniwind. API uses Vite + Nitro + Hono + oRPC, deployed
on Node 24.15.0 with the node-server preset. CLI compiles with Bun 1.4.3.

Nitro owns listening, public assets and shutdown. One Hono Fetch app mounts
/api/auth/_, /rpc/_ and /health. GET/HEAD HTML navigation can receive the SPA;
unknown APIs and missing assets retain 404. The complete output runs outside the repo.

## Libraries

Auth exports server/client/native/types. API creates the DB adapter and mailer
and injects them; auth never imports their concrete packages. Only account.get
is exposed through remote RPC. Its safe projection is { id, email, name }.

Contracts/api contains oRPC definitions; contracts/local contains Zod device
messages. Client is the remote SDK. Local interfaces are never registered on
public RPC. UI contains DOM components and pure theme/native CSS entries.
I18n contains static English/Chinese catalogs and platform adapters.
DB owns fresh auth-only schema/migrations; mail owns auth delivery/templates.

## Device runtime

The same CLI runtime handles human commands and Desktop NDJSON requests. Desktop
never imports CLI source. Files use canonical root grants, relative paths,
symlink/traversal checks, bounded UTF-8 and atomic writes. Delete requires confirmation.
External commands use executable + argv + cwd, with shell use explicit; they retain
normal OS permissions. PTY output is bytes encoded as base64; dates are ISO strings.

SQLite stores profiles, roots, schedules and bounded run history. A profile has
one scheduling owner and per-job execution locks. Cron uses five fields and an
IANA zone, skips missed triggers, and never retries interrupted commands on restart.
Tray runtime owns scheduling; explicit Quit/EOF cancels managed work. Local state
and theme/locale preferences survive account logout.

## Extension

See [workspaces](../development/workspaces.md). Keep testing/app-kit/runtime modules
at their current owners until a second actual consumer justifies extraction.

Desktop also persists validated theme/language preferences in an atomic native
file and restores them before renderer scripts. WebKit custom-scheme localStorage
alone is insufficient across full process restarts. This storage is independent
of the CLI so preferences remain usable if the local engine is unavailable.
