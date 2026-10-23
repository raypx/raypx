# Single-server beta deployment

The Node beta runs Web, one API process and an isolated PostgreSQL 17 database.
Dokploy owns deployment visibility and Traefik. `deploy/beta/compose.yaml` uses
versioned images already built on the server; it never rebuilds during startup.
Only Traefik publishes application traffic. The beta database uses the dedicated
`raypx-beta-postgres` volume and database `raypx_beta`.

## Access and configuration

Use SSH keys and verify a second key-authenticated connection before disabling
password authentication. Keep Dokploy's port 3000 reachable through an SSH tunnel,
with both host and Docker forwarding firewall rules blocking public access.
Cloud firewall rules should allow TCP 22, 80 and 443; UDP 443 is optional for HTTP/3.

Copy `deploy/beta/.env.example` into a protected host file outside the source tree,
for example `/opt/raypx-beta/private/beta.env`, with permissions `0600`. Generate
independent random values for `POSTGRES_PASSWORD` and `AUTH_SECRET`. Use a URL-safe
database password because it becomes part of `DATABASE_URL`.

`BETA_HOST` must resolve to the server. Traefik obtains an HTTPS certificate through
its `letsencrypt` resolver; set its account email before requesting a certificate.
With Cloudflare proxying DNS, verify both the public HTTPS route and the origin
certificate. Web and API share an origin, including cookies and WebSocket relay.
Configure Traefik entry-point `forwardedHeaders.trustedIPs` with Cloudflare's current
published IPv4/IPv6 ranges. Set `AUTH_IP_HEADERS=x-forwarded-for` and include those
ranges plus the actual `dokploy-network` subnet in `AUTH_TRUSTED_PROXIES`, so auth
rate limits resolve the client from the trusted proxy chain instead of grouping
every visitor under Traefik's address. Keep untrusted forwarded headers disabled.

`ADMIN_EMAILS` controls administration access for verified application accounts.
`RESEND_API_KEY` and a verified `MAIL_FROM` are required for real registration,
verification and password-reset mail. Without them the existing explicit mail
guard remains active; do not claim those flows are available.

## Build and deploy

The build stages contain both pinned Node and Bun. Bun's fallback `node` shim is
not the Node runtime used to build these artifacts. `VITE_APP_RELEASE` supplies
release metadata because Docker build contexts intentionally omit `.git`.

Create a bounded BuildKit builder once:

```sh
docker buildx create --name raypx-beta-builder --driver docker-container \
  --driver-opt memory=3g --driver-opt memory-swap=4g \
  --driver-opt cpu-quota=200000 --driver-opt cpu-period=100000
```

Choose a unique `RAYPX_RELEASE` for the exact source snapshot. Build sequentially:

```sh
BETA_HOST=beta.example.com RAYPX_RELEASE=<release> sh deploy/beta/build.sh
docker compose --env-file /opt/raypx-beta/private/beta.env \
  -f deploy/beta/compose.yaml config --quiet
```

In Dokploy, create a beta Compose service using the raw Compose configuration and
the protected environment values. Images stay local with `pull_policy: never`.
Set the platform's build concurrency to one. Disable automatic Docker image cleanup
for this local-image strategy; keep both the migration image and previous release
tags until explicitly retired. PostgreSQL must become healthy, then
the migration container must exit successfully, before API and Web start.
The runtime containers have explicit memory and CPU limits.

Check API `/health`, database-aware `/ready`, signed-out Web redirects, deep links,
real login and WebSocket upgrades. Container health checks probe API readiness and
Web liveness independently. Browser-preview checks do not validate packaged Desktop.

## Update and recover

Build new versioned images before changing `RAYPX_RELEASE` in Dokploy, then deploy
the existing Compose service. Keep the prior release and database volume. Take a
database backup before applying a release with schema migrations. Rolling images
back does not reverse schema migrations; confirm compatibility before rollback.

For a local fallback, use the same Compose project name shown by Dokploy when
running `docker compose -p <project> ...` so a second stack is not created.
Never use `down --volumes`, database reset commands or the retired database.
