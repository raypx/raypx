# Compose deployment and environments

The default topology is Web + one Bun backend + PostgreSQL. `apps/api` builds a
single Nitro artifact; `SERVER_ROLE=both` hosts HTTP and `/relay` together, with
direct scheduling/revocation calls. Redis is optional for shared caches and
multi-node routing. See [ADR 0051](../architecture/0051-backend-runtime-roles.md).

## Project boundaries and configuration

Dokploy and manual installations use `deploy/compose.yaml`, `deploy/build.sh` and
an explicitly supplied environment. Copy `deploy/.env.example` to a protected
`0600` file and set each project's domain, database password, authentication
secret and proxy addresses. Env files are ignored and excluded from image builds.
The build script reads exported public inputs; it never executes env files.

Use the existing Dokploy appName as `COMPOSE_PROJECT_NAME`. Image tags are
`raypx/api:<project>-<release>`, `raypx/web:<project>-<release>` and
`raypx/api-migrate:<project>-<release>`. Routers, networks and default PostgreSQL
volumes are scoped to that project. Preserve the project name across updates.
Choose a new release identifier whenever source or build inputs change.

Use URL-safe `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`; Compose
assembles the database URL. `AUTH_SECRET` must be independent per project. All
production API-enabled roles require explicit database, secret, HTTPS auth URL
and exact allowed origins. `POSTGRES_IMAGE_DIGEST` must be the verified
64-character manifest digest for postgres:17-alpine. Keep its prior value for
rollback. No floating-tag fallback is provided.

`POSTGRES_VOLUME_NAME` optionally selects known existing foundation storage.
Never discover another project's volume, reuse a retired database or run these
migrations against an operator database. New projects use their own isolated
volume and credentials.

`RESEND_API_KEY` and a verified `MAIL_FROM` enable account mail; unconfigured mail
retains `MAIL_NOT_CONFIGURED`. Optional OAuth, storage, analytics, cookie domain
and locale settings are explicit in the template. `JOBS_ENABLED` enables server
maintenance and cloud scheduling. Empty optional values disable integrations.
A configured Redis outage fails readiness and closes cluster peers; it never
falls back to local routing or queues uncertain execution for retry.

## Build and host

```sh
COMPOSE_PROJECT_NAME=raypx-app APP_HOST=app.example.com RAYPX_RELEASE=git-sha sh deploy/build.sh
```

Builds run sequentially: migration, backend, Web. Web bakes its API origin into
SSR/browser assets. API and Relay roles use the same backend output and image.
The portable Dockerfiles are `apps/api/Dockerfile` and `apps/web/Dockerfile`;
Compose and Railway use the same sources. Both use pinned Bun images and run as
the bun user.

`RAYPX_BUILD_BUILDER` defaults to raypx-builder. Creation limits default to two
CPUs, 3 GiB memory and 4 GiB including swap; BUILD_MEMORY, BUILD_MEMORY_SWAP and
BUILD_CPU_QUOTA override creation. Reuse a bounded builder for the shared
manifest/dependency layers. `build.sh` adds install cache mounts only to temporary
Dockerfiles and removes them on exit. The Dockerfiles run each workspace's `check`
and `build` scripts directly in the Git-free build context. Docker owns image caching.

The backend Dockerfile offers `runtime` (Nitro output), `migrate` (isolated DB
job) and default `deploy` (runtime plus pre-deploy migration payload). The payload
follows the Database production dependency closure and carries canonical SQL.
Startup migrations also use private bundled SQL unless
`DATABASE_MIGRATE_ON_START=false`. Every migration path shares the transaction
advisory lock and ledger. Failure aborts startup safely and removes temporary SQL.

Only Traefik publishes traffic. Keep the management panel behind SSH and block
public database/application ports. Set APP_HOST, DNS, TLS and the exact project
TRAEFIK_NETWORK. Attach only this project's containers and Traefik. Trust exact
proxy /32 or /128 addresses in AUTH_TRUSTED_PROXIES; never trust a shared subnet.
Traefik sends /api/, /rpc/, /health, /ready and /relay to the backend; other paths
go to Web. It strips Cookie and Authorization only on the relay route.

Validate without printing resolved secrets:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
```

## Optional split roles

`deploy/compose.split.yaml` overlays the default topology. API sets SERVER_ROLE=api;
Relay sets SERVER_ROLE=relay and uses the **same raypx/api image**, on port 3002.
Both require the same private REDIS_URL and foundation PostgreSQL. Relay receives
no AUTH_SECRET, cookie configuration, mail or provider credentials, runs no jobs
and performs no migrations. Supply the private broker separately.

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.split.yaml config --quiet
sh deploy/update.sh /absolute/path/to/protected.env --split
```

Railway uses the combined backend. Cloudflare uses this backend image with the
relay role. See [Railway](railway.md) and [Cloudflare](../../infra/cloudflare/README.md).
When changing an existing split deployment to combined mode, stop the old Relay
using its existing configuration before replacing backend/routing. Keep its old
image and protected configuration for rollback; do not delete its database or
volumes. Reconcile the selected topology explicitly during maintenance.

## Update and recover

Build images before changing RAYPX_RELEASE, back up the intended database and
retain protected settings plus running image digests. Use:

```sh
sh deploy/update.sh /absolute/path/to/protected.env
```

The script validates Compose, captures immutable previous images, waits for
PostgreSQL, stops backend writers, runs migration, then replaces backend and Web
with health waits. --split also captures/stops/replaces Relay. Transactional index
migrations require a maintenance window; ordinary Compose reconciliation does not
stop old writers first. Do not run a second writer against this database during
migration. Database locks have bounded waits.

On migration failure the untouched previous backend starts again. Replacement or
health failure restores captured images by digest, and still returns failure.
A failed first installation stays stopped. Temporary rollback overrides are
removed. This is an outage deployment; schema rollback never runs automatically.
Never use down --volumes, delete migration history or reset a deployment database.

Image rollback uses the supplied environment and cannot restore externally changed
secrets. Retain the prior protected environment and database backup separately.
If automatic recovery fails, inspect logs privately and restore known images
through a protected Compose override with the same project and volumes.

## Verification

Check HTTPS and origin certificate, /health, database/relay-aware /ready, redirects,
SSR assets, real login, secure cookies and authenticated WebSocket dispatch/revoke.
Unconfigured mail or unrun native/browser acceptance is unavailable, not passed.

`bun run smoke:deployment` builds the real Compose runtime/migration images and
Railway deploy image. It first exercises the combined backend without starting
Redis, then split roles from one image with a temporary broker. Both profiles
verify synthetic account login, cookies, SSR, assets, readiness and Relay through
the real gateway. Owned temporary databases/containers/networks/images are removed.
The fixture is separately bundled and mounted read-only into the migration image;
production images contain no synthetic provisioner. No operator resources are used.
See [validation evidence](validation-artifacts.md).

Container/deployment inputs select this gate in CI. The images are temporary and
never published. BuildKit progress streams to the CI job log. Only `results.json`
and `commands.json` are uploaded as artifacts. Policy reads `env.contract.ts`
without executing app code and checks all forwarded settings, role defaults, image
ports and ingress maps.

## Production environment

The production public origin is `https://raypx.com`. Deploy it through the
existing Raypx production Compose service in Dokploy.
It uses the same Compose workflow as Beta.

- Compose project: `raypx-prod-6yiunf`.
- Database: `raypx`, user `raypx`.
- Persistent volume: `raypx-prod-6yiunf_postgres`.
- Protected host configuration: `/opt/raypx/private/.env` (`0600`).
- Versioned source: `/opt/raypx/releases/<release>`.
- Configuration and database backups: `/opt/raypx/backups/<release>` (`0700`).

Keep these identifiers stable across deployments. Production has independent
database and authentication secrets. Its database is a new foundation database;
Beta and retired product data are not imported or migrated.

Release from a verified `canary` commit. Build the migration, backend and Web images
for `APP_HOST=raypx.com` and the exact Compose project name before changing the
service's `RAYPX_RELEASE`. Set `APP_HOST=raypx.com` in its runtime environment,
with matching auth, Web, relay and OAuth callback origins. DNS, the origin
certificate and public HTTPS must be configured for this hostname before
acceptance. Back up the database before migrations. The host can
reuse the bounded `raypx-beta-builder` and its caches; stop it after building.
Deploy through the existing Dokploy Compose service without replacing volumes.

Verify the origin certificate as well as public HTTPS, `/health`, `/ready`,
signed-out redirects, secure session cookies, real login and WebSocket relay.
The opt-in native and browser gates described in [testing](testing.md) accept
`https://raypx.com` through their explicit HTTPS settings despite their `beta`
command names. Use a dedicated acceptance account and remove it after testing.

Mail requires an explicitly configured `RESEND_API_KEY` and verified `MAIL_FROM`.
Until configured, registration verification and password-reset mail remain
unavailable behind the `MAIL_NOT_CONFIGURED` guard. Existing-account login is
independent of mail availability; never bypass verification for real users.

Desktop defaults to this production origin. Existing installations can retain a
Beta or self-hosted profile in `~/.raypx/config.toml`; deployment does not change
their selection. See [Desktop configuration](desktop.md#connection-configuration).

## Beta environment

These are explicit settings for the existing deployment. Confirm that selected
storage belongs to the intended foundation project; retired product databases
remain outside the new migration workflow.

The original `deploy/beta/` files moved to `deploy/`. Replace `BETA_HOST` with
`APP_HOST`. Use the existing Dokploy service's exact `appName` as
`COMPOSE_PROJECT_NAME`; preserve it for every update.

For the original beta database, explicitly keep `POSTGRES_DB=raypx_beta` and
`POSTGRES_VOLUME_NAME=raypx-beta-postgres`. This adopts the existing named storage.
New projects leave the volume override empty and get project-scoped storage.
Back up configuration and the database before changing the Compose configuration.

To reuse a bounded builder, set `RAYPX_BUILD_BUILDER` explicitly. Hostnames,
credentials and storage are never inferred or migrated by the scripts.
