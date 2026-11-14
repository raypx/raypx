# Local development

Raypx runs Web and a server-owned Agent backend as separate Bun services.
PostgreSQL is the authority for Spaces, conversations, Runs and capabilities.
The optional supervisor provides computers. Desktop's retained CLI/daemon and its
SQLite profiles are a different runtime; they are not required for Web Agent work.

## Prerequisites

Use Bun 1.4.4 from root `package.json`. Direct installs work; mise can read that
pin through the committed `mise.toml` without a `[tools]` table:

```sh
mise trust
mise install
bun install
bun run doctor
```

Desktop native development additionally needs Go 1.27.3 and the pinned MyGo 0.8.3
host, built with `CGO_ENABLED=0`. macOS packages target 13.5+; Windows uses WebView2.
Linux Desktop acceptance remains unverified. Mobile uses Expo and native development
builds; see [Mobile](mobile.md) for SDK alignment and device requirements.

`bun install` installs the Vite+ Git hooks. `vp staged` formats/lints staged files;
the commit hook checks [Conventional Commits](../../CONTRIBUTING.md#commit-messages).
`bun --bun vp hooks status` checks installation and `VP_GIT_HOOKS=0` skips hooks.
Tests and type checks run through `verify`, independently of these hooks.

## Database and environment

```sh
cp .env.example .env
docker compose up -d postgres
bun run db:migrate
```

Root `compose.yaml` creates PostgreSQL 17 on port 5433 in the separate
`raypx-foundation-postgres` volume. The example URL selects `raypx_foundation`.
Never select a retired or operator database for startup, migrations or tests.
API startup applies pending migrations by default; set
`DATABASE_MIGRATE_ON_START=false` when managing them separately. Migration failures
stop startup. `bun run db:generate` generates schema migrations; `bun run db:studio`
is a read/write console on the configured database, not a test command.

Development/build/env commands read root `.env`, then `.env.local`; inherited
shell values win. Values are literal: `${VAR}` is not expanded. Tests supply an
explicit environment. `bun run raypx-dev env -- <command>` loads this same
configuration for an operator command without printing it.

| Input                                                          | Local use                                                                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                 | New isolated PostgreSQL database.                                                                                             |
| `AUTH_URL`, `ALLOWED_ORIGINS`                                  | API origin and exact allowed Web/native origins; example ports are 3002 and 3000.                                             |
| `AUTH_SECRET`, `APP_KEY`                                       | Independent secrets; replace development examples before deployment. API and workers share the encryption key.                |
| `VITE_API_URL`, `VITE_WEB_URL`                                 | Public Web build inputs; rebuild when changing them. Installed Desktop uses runtime TOML.                                     |
| `SERVER_ROLE`                                                  | Defaults to `all`: API, worker and retained Relay.                                                                            |
| `AGENT_MODELS`, `AGENT_MODEL_CREDENTIALS`                      | Optional deployment model directory and protected credential map; empty defaults disable deployment offers.                   |
| `COMPUTER_PROVIDER`                                            | `none` by default; `docker` requires the private supervisor URL and dedicated token.                                          |
| `APPROVAL_DEFAULT_MODE`, `APPROVAL_REQUEST_TTL_MS`             | Defaults: `ask` and 600000 ms. Auto review is explicitly unavailable.                                                         |
| `RUN_RECOVERY_INTERVAL_MS`, `RUN_LEASE_MS`, `RUN_HEARTBEAT_MS` | Defaults: 5000, 15000 and 5000 ms.                                                                                            |
| `RUN_ATTEMPT_TIMEOUT_MS`, `RUN_BACKUP_MARGIN_MS`               | Defaults: 300000 and 30000 ms.                                                                                                |
| `JOBS_ENABLED`                                                 | Enables Nitro maintenance and retained account scheduling; false in the development example. Space routines use worker scans. |
| `ROUTINE_EMAIL_RELAY_TOKEN`, `ROUTINE_EMAIL_DOMAIN`            | Paired configuration for server routine email ingress; Raypx does not run SMTP.                                               |
| `REDIS_URL`                                                    | Optional cache/broker; required for split retained API/Relay device transport.                                                |

Configure mail through [administrator settings](configuration.md#resend-email).
Unconfigured mail actions return `MAIL_NOT_CONFIGURED`; use a real configured mail
transport to complete ordinary account verification. Tests inject mail delivery.
After sign-in, add a model connection under account Models or configure the
[deployment catalog](../architecture/execution.md#deployment-model-configuration).
Secrets remain backend-only. An empty/unavailable offer does not choose a fallback.

## Web and backend

```sh
bun dev
# Or select one service through the same graph:
bun run raypx-dev tasks dev --filter api
bun run raypx-dev tasks dev --filter web
```

Web runs on 3000 and API on 3002. Sign in and open `/agents`. The sidebar selects
a Space and direct Agent or group; the conversation header opens routines, Space
memory and the computer panel. Pages has its own navigation entry. Account settings
hold model connections, approval rules, Skills and Tools. Still working keeps
active Runs reachable above the composer when their triggers are outside loaded
history. In Tools, Space owners can register OpenAPI JSON/YAML or fetch it once,
select operations and choose Agent availability; credentials are write-only.
Mobile shares the active-Run model and renders API activity/approvals, while API
management remains in Web/Desktop.

Bun runs Nitro's `bun` output in production:

```sh
bun run build:api
bun run build:web
# In separate terminals:
bun apps/api/.output/server/index.mjs
bun apps/web/.output/server/index.mjs
```

Use a common origin or `AUTH_DOMAIN` for the parent of sibling Web/API hosts so
SSR receives the session cookie. `/events` is the authenticated Agent/Space stream;
`/relay` is retained device transport. Proxies must route both correctly, along with
`/rpc`, `/api`, `/routines/` and `/page-content/` where those features are used.

`SERVER_ROLE=api` serves requests and starts committed Runs directly;
`SERVER_ROLE=worker` scans recovery, routines and claimed Space deletion without
exposing account RPC; `relay` serves retained device connections. `all` combines
them. The retained `both` value also combines all three. API/worker coordination
uses PostgreSQL only. To split retained device routing, start a private cache with
`docker compose up -d valkey` and use `REDIS_URL=redis://localhost:6380` on both sides.
Do not start extra API processes to obtain crash recovery without running a worker.

## Computers

Follow [sandbox setup](sandbox.md) to build an immutable computer image, run a
private supervisor on Docker or Colima and configure the backend's Computer port.
Only the supervisor opens the Engine socket. Starting Web/API alone allocates no
computer. Computer file reads do not implicitly start it; explicit Start or an
executed tool can. Host egress enforcement is separately configured and verified.

## Desktop

```sh
bun dev:desktop
```

This stages the matching bundled CLI and starts Vite/MyGo. The API and Web must
also be running for the local server. Installed/native Desktop reads connection
settings once from `~/.raypx/config.toml` (or an absolute isolated `RAYPX_HOME`):

```toml
base_url = "http://localhost:3002"
web_url = "http://localhost:3000"
```

Fully quit and restart after editing. Named connection profiles and local CLI
profiles are distinct; endpoint changes never transfer an enrolled identity.
[Desktop configuration](desktop.md#connection-configuration) explains origin/session
isolation. The renderer shares Agent state with Web and keeps cookies private in
the daemon. Page previews hand off to Web. `bun run package:desktop` is an explicit
native packaging gate, not necessary for ordinary renderer development.

## Mobile and UI

```sh
bun dev:mobile
bun dev:storybook
```

Mobile's `apps/mobile/.env.local` may set `EXPO_PUBLIC_API_URL` to an HTTPS gateway
reachable from the phone. It is public bundle configuration, not a secret. A
loopback URL on the development computer is not the phone's server. Mobile supports
Agent/direct conversation, approval and computer lifecycle workflows; Page links
open Web. See [Mobile](mobile.md) for native builds and unverified device gates.
Storybook previews shared DOM UI on 6006.

## Verify and maintain

```sh
bun run test --package @raypx/agents
bun format --write
bun run policy
bun run verify
```

Use `bun run test`, not Bun's built-in `bun test`. [Testing](testing.md) documents
source layers, PostgreSQL, owned-backend journeys, browser, sandbox and Mobile
gates. Default verification needs no database or GUI. `verify --full` adds builds
and artifact probes; it does not substitute for separate platform acceptance.

Turbo is the sole task graph/cache. Workspace scripts are leaf commands, so root
commands provide prerequisites and platform keys. `bun run workspace:list` derives
the inventory from root manifest patterns. Catalogs own external versions: shared
runtime in `catalog:`, Mobile in `catalog:mobile`, tools in `catalog:dev`.

`bun run clean:artifacts` removes generated evidence and test reports while keeping
builds and user data. `bun run clean` also removes build/cache outputs and staged
native resources. See [validation evidence](validation-artifacts.md) for retention.
Neither command should be used to remove another process's active resources.

## Retained device runtime

The [CLI guide](../../apps/cli/README.md), [terminal host](terminal-host.md) and
[local SQLite](local-sqlite.md) describe still-present device consumers until their
replacement phase. Enrollment, local grants and profile history never authorize a
Space. Registering a device is not part of the server Agent setup above.

Vendored repository skills live in `.agents/skills/`; `skills-lock.json` records
their sources. `bun run skills:update` refreshes upstream bytes for review. Do not
edit them by hand or confuse them with account/Space text skills in the product.
