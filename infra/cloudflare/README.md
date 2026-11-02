# Cloudflare Relay

`relay-cloudflare` adds an optional Workers + Containers deployment for the
[independent Bun Relay](../relay/README.md). Railway remains available. API/Web
stay at their existing origins; API and this Relay share PostgreSQL and Redis.
The Worker is a managed ingress, and the container runs the existing
`infra/relay/Dockerfile` with repository-root build context.

The Worker forwards `GET /relay` WebSocket upgrades, `GET /health` and `GET /ready`.
Other paths return 404. Queries, unsupported methods and unapproved browser
origins are rejected before waking a container. Native clients can omit Origin.
Cookie, Authorization, proxy authorization and container-control headers are
removed. Relay still authenticates the first frame and owns ticket/grant,
epoch, replay and backpressure checks. API login routes are never published here.

## Resources and configuration

Use a Cloudflare account with Workers, Durable Objects and Containers enabled,
and a Cloudflare-managed zone for the same-origin route. Docker is required for
local container builds and local development. Bun remains the local toolchain
and container runtime. Only the managed Worker runs in workerd, using the
SDK's Node-compatible surface (`nodejs_compat`).

`wrangler.json` defines a SQLite-backed Container Durable Object, one fixed
instance name (`relay`), a `basic` instance type and `max_instances: 1`. Container
state is disposable; PostgreSQL owns authorization and Redis owns private routing.
Do not derive instance names from request parameters or add per-account containers.
Cloudflare rollout and instance limits can temporarily affect availability; the
single-instance configuration does not promise zero downtime.

Three secret bindings are required:

| Binding           | Requirement                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`    | The same database used by API, exposed over verified TLS; use `postgresql://…?sslmode=verify-full` |
| `REDIS_URL`       | The same broker used by API, reachable over TLS with `rediss://…` and restricted credentials       |
| `ALLOWED_ORIGINS` | Comma-separated exact HTTPS origins, such as `https://app.example.com`                             |

Cloudflare cannot resolve Railway private `*.railway.internal` addresses. Provide
externally reachable endpoints with publicly trusted certificates and restricted
credentials. A TCP proxy alone does not add TLS. Confirm connectivity from the
container before switching traffic. Migrations remain API's isolated migration job.
Do not point development or verification at an operator database.

The container receives only these three bindings plus `NODE_ENV=production`,
`HOST=0.0.0.0` and `PORT=3003`. API's `AUTH_SECRET`, cookies, mail and provider
credentials stay with API. Worker invocation logging is disabled. Never put
secrets in `vars`, Docker build arguments, Git, URLs or CLI flags.

## Development and validation

Run from the repository root:

```sh
bun install
bun run --cwd infra/cloudflare check
bun run test --package relay-cloudflare
bun run --cwd infra/cloudflare plan:worker
```

`plan:worker` builds through VP and runs Wrangler's Worker dry-run with container
rollout disabled. It validates the Worker/config without Docker or publishing.
It does **not** validate the image, database connectivity or live WebSockets.
`plan` performs the complete dry-run, including the Docker build. It is a build
validation, not a remote infrastructure diff, and uploads no deployment.

```sh
bun run --cwd infra/cloudflare plan
cp infra/cloudflare/.dev.vars.example infra/cloudflare/.dev.vars
# Edit .dev.vars to use dedicated development resources with verified TLS.
bun run --cwd infra/cloudflare dev
```

Use an allowed HTTPS browser origin or a native WebSocket client without Origin
when exercising local Wrangler ingress. The ordinary Bun development workflow
remains `bun run dev`. Local Wrangler includes the real Container integration and
requires a running Docker daemon. `.dev.vars`, Wrangler state and generated
configuration are ignored and excluded from the image context.

The Bun launcher generates a temporary config beside `wrangler.json`, adds only
the public Git SHA (or `VITE_APP_RELEASE`) as the image build argument, and removes
it after Wrangler exits. VP owns Worker builds/checks and caching. The container
build continues to use the existing Bun Relay build. CI outside a Git checkout
must supply a public `VITE_APP_RELEASE` identifier.

## Deployment and cutover

Set the intended account using Wrangler login or your CI's Cloudflare account/token
environment. Choose the Worker name in `wrangler.json` before storing secrets.
`workers_dev` and preview URLs are disabled and no public routes are configured
by default, so the initial deployment does not take over production traffic.

```sh
bun run --cwd infra/cloudflare --bun wrangler login
bun run --cwd infra/cloudflare plan
bun run --cwd infra/cloudflare deploy
bun run --cwd infra/cloudflare --bun wrangler secret put DATABASE_URL
bun run --cwd infra/cloudflare --bun wrangler secret put REDIS_URL
bun run --cwd infra/cloudflare --bun wrangler secret put ALLOWED_ORIGINS
```

Enter secret values at the prompts or provide them on standard input from a secret
manager. Each command uses the same workspace config and Worker name. Treat API,
Relay and broker changes as one rollout; preserve the previous route and image
version for rollback.

First add only a dedicated Relay hostname in your actual zone to `wrangler.json`:

```json
"routes": [
  { "pattern": "relay.example.com", "custom_domain": true }
]
```

Deploy again. The dedicated Relay hostname permits acceptance without moving app
traffic or colliding with API's `/health` and `/ready`. Do not configure this
hostname as a fallback for API/Web traffic.

Before the traffic switch, verify `/health` and `/ready` return 200 on the dedicated
hostname, complete a real authenticated viewer/device connection, and exercise API
dispatch, revocation and reconnect. A successful `/health` alone does not establish
backend readiness. Revert the application route to the previous Relay if acceptance
fails. Existing WebSockets may disconnect during a rollout; clients reconnect
through the current v4 protocol without automatic replay of uncertain work.
Avoid dispatching work during the controlled cutover.

After acceptance, add this second entry to `routes` and deploy to switch traffic:

```json
{ "pattern": "app.example.com/relay*", "zone_name": "example.com" }
```

The application route intercepts `/relay` before the existing origin; other app
paths keep their current routing. Keep the app on Cloudflare's proxied DNS and
include its exact HTTPS origin in `ALLOWED_ORIGINS`. Desktop/CLI keep the existing
application server origin. Repeat authenticated dispatch/revocation acceptance
through that origin after the switch. Remove/revert the application Worker route
to restore the previous origin Relay if acceptance fails.

Secret updates affect the environment on the **next container start**. Drain
connections and stop ingress/health polling for at least the configured `10m`
idle timeout before reconnecting after a rotation, or arrange a controlled
container replacement through Cloudflare. Confirm `/ready` and authenticated
dispatch after restart; uploading a secret alone does not rotate a running process.
Open WebSockets keep the container active, so long-lived sessions incur container
runtime charges and do not scale to zero. Do not delete the Durable Object or
application as a routine restart mechanism.

Repository verification includes source checks and ingress unit tests. Docker
builds, real Cloudflare runtime acceptance and live PostgreSQL/Redis acceptance
are separate gates; neither a Worker dry-run nor unit tests establishes them.

Provider references: [Containers Wrangler configuration](https://developers.cloudflare.com/containers/configuration/wrangler/),
[Container SDK](https://developers.cloudflare.com/containers/api/container-class/),
[WebSockets](https://developers.cloudflare.com/containers/examples/websocket/),
[environment variables and secrets](https://developers.cloudflare.com/containers/examples/env-vars-and-secrets/).
