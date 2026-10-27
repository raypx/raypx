# Node and Cloudflare deployments

Web and API each support two deployment targets while sharing their routes,
authentication, contracts and application logic. Node remains the default.
Desktop and CLI continue to execute on the user's device.

## Build and preview

Run these commands from the repository root with the pinned development toolchain.

| Target  | Web                            | API                            | Output in each app   |
| ------- | ------------------------------ | ------------------------------ | -------------------- |
| Node    | `bun run build:web`            | `bun run build:api`            | `.output`            |
| Workers | `bun run build:web:cloudflare` | `bun run build:api:cloudflare` | `.output-cloudflare` |

Node still starts with each app's `start` script and existing Dockerfile.
Workers use each app's `wrangler.jsonc`. Build before previewing or deploying:

```sh
bun run preview:web:cloudflare
bun run preview:api:cloudflare
bun run deploy:web:cloudflare
bun run deploy:api:cloudflare
```

Vite's explicit `cloudflare` mode selects Nitro's `cloudflare_module` preset.
API and Web share target options from `packages/tooling/src/build/nitro.ts`;
each app keeps its own routes, runtime plugins and framework settings.
Worker dependencies are bundled, and its build directory and output are separate
from Node. VP gives `build` and `build:cloudflare` independent task definitions and output caches.
The default verification graph builds both and probes their relocated artifacts.

Web keeps page routes Worker-first, with `/assets/*` and `/favicon.png` excluded
from `run_worker_first`. Existing JS, CSS and favicon files are served directly
by Cloudflare Assets without invoking the Worker. Other routes continue through
SSR and server handlers, including personalized account pages. Missing assets and
unknown page routes retain 404 responses; no SPA or static HTML fallback is
enabled. Nitro's generated `_headers` preserves immutable caching for built assets.
The Worker artifact probe checks both routing paths under workerd.

Web SSR always uses the API origin baked into `VITE_API_URL`; set it before
building either Web target. Without a session cookie, signed-out SSR makes no
API call. Logged-in SSR forwards only Better Auth cookies. The Web Worker's
`global_fetch_strictly_public` flag routes these HTTP calls through the public
Cloudflare front door when the API is also a Worker in the same zone.

## Cloudflare Workers Builds

Create separate Workers named `raypx-web` and `raypx-api`, matching the app
configuration files. Connect both to the repository and choose the intended
production branch. Keep the build root at `/` so Bun installs the complete workspace.

| Worker      | Build command                  | Deploy command                  |
| ----------- | ------------------------------ | ------------------------------- |
| `raypx-web` | `bun run build:web:cloudflare` | `bun run deploy:web:cloudflare` |
| `raypx-api` | `bun run build:api:cloudflare` | `bun run deploy:api:cloudflare` |

Set the repository's pinned `BUN_VERSION` and `NODE_VERSION` in Builds. Web needs
`VITE_API_URL` as a build variable. API credentials belong in Worker runtime
variables and Secrets, available when handling a request:

| Setting                                 | Purpose                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `NODE_ENV=production`                   | Declared in API Wrangler config; enables production validation                      |
| `ADMIN_EMAILS`                          | Comma-separated verified administrator emails for [site settings](configuration.md) |
| `JOBS_ENABLED=true`                     | Opt in to bounded expired-record cleanup every 15 minutes                           |
| `AUTH_URL`                              | Public HTTPS API origin                                                             |
| `AUTH_SECRET`                           | Explicit secret of at least 32 characters                                           |
| `ALLOWED_ORIGINS`                       | Exact trusted Web and Desktop origins                                               |
| `DATABASE_URL`                          | PostgreSQL URL when no Hyperdrive binding is configured                             |
| `AUTH_DOMAIN`                           | Optional shared parent cookie domain for sibling Web/API hosts                      |
| `AUTH_IP_HEADERS`                       | Client IP headers for auth rate limits; `cf-connecting-ip` default                  |
| `RESEND_API_KEY`, `MAIL_FROM`           | Verification and reset mail delivery                                                |
| `MAIL_DEFAULT_LOCALE`                   | Optional `en` or `zh` default                                                       |
| `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST` | Optional API error reports to PostHog error tracking                                |

Keep cookies HTTPS/secure and retain the existing trusted-origin checks. With
separate Web and API hosts, SSR must receive the session cookie through a shared
cookie domain. Missing mail configuration returns `MAIL_NOT_CONFIGURED` before
sign-up or reset-mail requests reach the database.

API includes a Cron Trigger for `maintenance:cleanup`. Apply foundation migrations
before enabling `JOBS_ENABLED`; see [server jobs](server-jobs.md) for retention,
batch limits, locking and scheduled-event verification.

For local Worker preview, copy `apps/api/.dev.vars.example` to `.dev.vars` in
that app and fill in the development configuration. The file is Git-ignored.
Local Node development continues to use the existing development environment.

## PostgreSQL and Hyperdrive

The same PostgreSQL schema and migrations serve both targets. Run migration
commands with the existing Node/Bun tooling against the intended new foundation
database. Worker requests import `@raypx/database/connection`, which excludes migration
code and filesystem access.

The API accepts an optional `HYPERDRIVE` binding. Create a Hyperdrive configuration
for the intended PostgreSQL database with query caching disabled, then add its
real identifier to `apps/api/wrangler.jsonc`:

```jsonc
{
  "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<your-hyperdrive-id>" }],
}
```

The binding's connection string takes precedence over `DATABASE_URL`. Node keeps
its process pool; Workers create a client per request with at most five connections.
Hyperdrive owns the origin pool. Keep the driver's default prepared statements enabled.
Authentication, session and password-reset reads must use a cache-disabled
Hyperdrive configuration so revocation and reads after writes remain fresh.

## Verification and limits

```sh
bun run verify
bun run smoke:cloudflare
NODE_ENV=test TEST_DATABASE_URL=postgres://user:password@localhost/raypx_foundation_test bun run test:postgres
NODE_ENV=test TEST_DATABASE_URL=postgres://user:password@localhost/raypx_foundation_test bun run test:postgres:cloudflare
```

The default gate requires no database or mail provider. It runs both Node
artifact probes and actual workerd probes for SSR locales, preferences, assets,
404s, request IDs, unauthenticated RPC, unavailable mail and concurrent requests.
The PostgreSQL gates require an isolated database whose name ends in `_test`.
CI runs them against PostgreSQL 17. The Worker gate builds API first and tests
both direct connections and local Hyperdrive bindings. It seeds a verified
account and creates reset mail through an injected Node fixture, then exercises
Worker sign-in, concurrent account reads, password replacement, old-session
revocation and sign-out. It does not deliver real email or contact Cloudflare.

Password hashing and SSR consume CPU. Workers Free permits 10 ms of CPU per HTTP
request; validate the API's password-hashing workload and account limits before
production deployment. Keep the password-hashing policy shared across targets.
Local workerd tests do not establish production CPU-budget acceptance or verify
the remote Hyperdrive pool, provider email delivery or real HTTPS cookie behavior.

References: [Nitro Workers](https://nitro.build/deploy/providers/cloudflare),
[Postgres.js and Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js/),
[Hyperdrive caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/),
[public fetch routing](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public),
and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time).

## Remote Agent relay

API's `/relay?account=<account-id>` upgrades to WebSocket. The account ID only
routes to a room; the first frame must authenticate with a scoped device grant
or a single-use viewer ticket. Tokens never enter URLs. `RAYPX_RELAY` binds the
exported `RelayRoom` class; `relay-v1` creates its SQLite-backed Durable Objects.
Deploy the binding and migration together with the API artifact. Node uses Nitro's
WebSocket adapter and currently requires a single API relay process.

Cloudflare rooms coordinate connections across Worker instances. This release
uses the standard Durable Object WebSocket API, so connected rooms incur duration
charges; hibernation is a future optimization. WebSocket handlers create and close
a request-owned database runtime for each operation. Authentication remains in
PostgreSQL; Durable Object storage does not replace the account database.
