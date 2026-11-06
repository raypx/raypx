# Independent Relay

`relay` is a private Node application workspace, deployed independently on Railway.
An optional [Cloudflare Workers + Containers adapter](../cloudflare/README.md)
deploys the same Node image with managed edge ingress.
It owns WebSocket connections and relay v4 message routing. API owns login,
device/host grants, one-time viewer tickets, HTTP read models and scheduling.
Device-local execution stays in the CLI daemon.

For an accepted remote `tasks.create`, Relay resolves the requested account memory
revisions and persists their immutable context snapshot with the command before
delivery. This preserves retry identity if a reference changes while a response is
lost. Memory document CRUD remains on API RPC; Relay does not expose those use cases.
Relay's PostgreSQL connection backs shared `@raypx/control` services for socket
credential checks and durable remote command state. Its `@raypx/memory-server`
dependency is limited to resolving those selected revisions into the snapshot;
login/session handling and memory CRUD remain API-only.

| Endpoint      | Behavior                                                                            |
| ------------- | ----------------------------------------------------------------------------------- |
| `GET /relay`  | Upgrade to WebSocket; the first frame authenticates a viewer ticket or device grant |
| `GET /health` | Process liveness without database access                                            |
| `GET /ready`  | Bounded PostgreSQL and private-broker readiness                                     |

The gateway sends `/relay` to this service, strips Cookie/Authorization headers,
and sends authentication/RPC to API. Browser,
Desktop and CLI clients keep their same-origin URLs. Only Vite's development proxy
forwards `/relay` on port 3002 to Relay on 3003; the built API exposes no socket route.

## Local development

Install from the repository root. Root `.env.example` supplies the shared local
PostgreSQL/Redis configuration; `infra/relay/.env.example` documents the Relay-only
variables. `pnpm run dev` starts Web, API and Relay using the root environment.

```sh
pnpm install
cp .env.example .env
docker compose up -d postgres valkey
pnpm run db:migrate
pnpm run dev
```

For focused work, run `pnpm --dir infra/relay run dev`, `check`, `test`, or
`pnpm run build:relay`. The Vite SSR build bundles dependencies into `dist/main.js`,
which starts with `node infra/relay/dist/main.js` and runs outside the repository.

## Deployment

Build `infra/relay/Dockerfile` from the repository root. Railway's application
partial and Dokploy Compose declare the Relay service and readiness probe. API and
Relay must share the intended environment's `DATABASE_URL` and private `REDIS_URL`.
Relay additionally receives `NODE_ENV`, `HOST`, `PORT` (3003), and exact
`ALLOWED_ORIGINS`. It needs no session cookie, auth secret, mail, storage or provider
credentials. Apply database migrations through API's isolated migration job first.

For Railway private IPv6 networking set `HOST=::` and set Gateway's
`RELAY_UPSTREAM=${{relay.RAILWAY_PRIVATE_DOMAIN}}:3003`. Provision the service and
variables before publishing a gateway/API build that uses the split. API's
`AUTH_SECRET` stays private to API. Public domains remain on Gateway.

For the first Dokploy split, pause autodeploy and use a maintenance window with
the previous protected Compose/environment files and image digests available.
Stop the old API, run the isolated migration, then start Relay, API and Web with
health waits. Restore the previous Compose topology explicitly if that first
cutover fails. `deploy/update.sh` rejects an existing API without an independent
Relay because image-only rollback cannot restore the previous socket routes.
Subsequent updates capture all three images and stop both API and Relay during
migrations before replacing the services.

The broker carries bounded private commands, revocations and projection notices;
it is not an execution queue. PostgreSQL owns authorization and connection identity.
Redis failure closes Relay peers and fails readiness until subscriptions recover.
API-only deployments without a broker keep authentication available but cannot
dispatch remote work. There is no process-local routing fallback or automatic
retry after uncertain delivery.

`@raypx/control` holds shared control-plane services and PostgreSQL adapters. It
preserves one-time tickets, host/session/epoch fencing, replay acknowledgements,
immutable task-context receipts, account ownership and bounded backpressure.
Runtime code never imports API or another application.

Run `pnpm run verify` for source validation. `pnpm --dir packages/tooling run test:backends`
provisions owned temporary PostgreSQL/Redis services and includes a cross-process
API-to-Relay dispatch/revocation test. `pnpm run smoke:deployment` additionally
builds and probes actual images; it requires Docker and does not apply Railway IaC.
Full verification also probes the relocated Relay bundle under Node with deliberately
unavailable dependencies, checking liveness, closed readiness and API-route isolation.
