# Shared deployment per project

Every Dokploy Compose service uses the same `deploy/build.sh` and
`deploy/compose.yaml`. Each project supplies its own environment variables.
`deploy/.env.example` is the common template; there is no beta/production branch
or credential discovery in the scripts.

## Project boundaries

Dokploy runs Compose with its service's unique project name (`appName`). Use that
exact value as `COMPOSE_PROJECT_NAME` when prebuilding images. For a manual
installation, choose a unique project name and keep it stable across updates.

- Image tags are `raypx/api:<project>-<release>`, `raypx/web:<project>-<release>`
  and `raypx/api-migrate:<project>-<release>`.
- Traefik routers/services use the Compose project name.
- Backend networks and PostgreSQL volumes are scoped to that project.
- Domain, database password, authentication secret, administrators, mail and
  resource limits are explicitly configured for each project.

Two projects can use the same source version and the same internal database name.
Their containers and storage remain separate. Generate independent credentials.
The Web API origin is baked into browser and SSR artifacts, so each project builds
for its own `APP_HOST`. Choose a new release identifier whenever source or build
inputs change, including a changed host.

`POSTGRES_VOLUME_NAME` is an optional override for adopting known existing storage.
Leave it empty for the default `<compose-project>_postgres` volume. Never point it
at another project's data, and never run new migrations against an old/operator
database. See [existing beta](beta.md) for the original deployment's transition.

## Configuration

Copy `deploy/.env.example` to `deploy/.env` (or any explicitly selected env file),
set permissions `0600` and fill required values. Actual `.env`/`.env.*` files are
ignored by Git and excluded from Docker contexts. `.env.*.example` templates remain
trackable. Each independent checkout/project can simply use `.env`; multiple
files in one checkout can use `.env.beta` and `.env.prod` with `--env-file`.

Compose/Dokploy injects the variables. The build script receives exported public
build variables and does not load or execute env files. Missing required runtime
variables fail during Compose validation. Application secrets are never build args.

Use URL-safe `POSTGRES_PASSWORD`, `POSTGRES_USER` and `POSTGRES_DB` because Compose
assembles `DATABASE_URL` from them. `AUTH_SECRET` is independent per project. All
instances use `NODE_ENV=production`, HTTPS and secure cookies.
`RESEND_API_KEY` and a verified `MAIL_FROM` enable registration, verification and
password-reset mail. Otherwise the explicit mail guard remains active.
`JOBS_ENABLED` controls maintenance scheduling.

## Build

```sh
COMPOSE_PROJECT_NAME=raypx-app APP_HOST=app.example.com RAYPX_RELEASE=git-sha sh deploy/build.sh
```

The script builds migration, API and Web sequentially. It creates
`RAYPX_BUILD_BUILDER` (default `raypx-builder`) on first use. Creation limits default
to two CPUs, 3 GiB memory and 4 GiB memory plus swap. `BUILD_MEMORY`,
`BUILD_MEMORY_SWAP` and `BUILD_CPU_QUOTA` override creation settings; the fixed CPU
period is 100000 microseconds, so quota 200000 means two CPUs. Change existing
limits explicitly or choose a new builder name. A stopped builder starts on the
next build. Reuse one bounded builder for the shared Bun download and VP task cache.

Build stages contain pinned Node and Bun; Node runs Web/API builds. The script
supplies `VITE_APP_RELEASE` because Docker contexts omit `.git`. Migration images
install only database production dependencies and run as the `bun` user.

## Host and deploy

Use SSH keys, verify a second key connection before disabling password login and
keep Dokploy's port 3000 behind an SSH tunnel. Both host and Docker forwarding
firewalls must block public management access. Allow TCP 22, 80 and 443; UDP 443 is
optional for HTTP/3. Only Traefik publishes application traffic.

Point `APP_HOST` at the host. `TRAEFIK_NETWORK` defaults to `<COMPOSE_PROJECT_NAME>-ingress`, which
must already exist and contain only this project's Web/API containers and Traefik.
Create a distinct network for each project and explicitly connect Traefik with a
stable address. Do not attach application containers to the shared Dokploy network. Set the certificate account email before requesting TLS using
`TRAEFIK_CERT_RESOLVER` (default `letsencrypt`). With Cloudflare, check public HTTPS
and the origin certificate. Web and API share an origin for cookies and relay.

Set Traefik entry-point `forwardedHeaders.trustedIPs` to trusted edge ranges.
`AUTH_IP_HEADERS=x-forwarded-for` and `AUTH_TRUSTED_PROXIES` include those ranges
plus Traefik's exact `/32` or `/128` address. Never trust an entire shared Docker
subnet. The Node entry verifies the real socket peer before accepting forwarding
headers. Keep untrusted forwarding disabled.

Validate without printing resolved secrets:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
```

Give each Dokploy service the same raw Compose file and its own variables. Images
must exist on that host (`pull_policy: never`). Set Dokploy build concurrency to
one; disable automatic image cleanup for this local-image strategy. Keep prior
release tags and the migration image until explicitly retired.

PostgreSQL becomes healthy, migration exits successfully, then API and Web start.
Keep one API process because Node relay authority is process-local.
`POSTGRES_MEMORY`/`POSTGRES_CPUS`, `MIGRATE_MEMORY`/`MIGRATE_CPUS`,
`API_MEMORY`/`API_CPUS` and `WEB_MEMORY`/`WEB_CPUS` configure runtime limits. Budget
for all projects, Dokploy and builds on a shared host.

Check `/health`, database-aware `/ready`, signed-out redirects, real login,
WebSocket upgrades and that images/routes/volumes belong to the intended project.
Browser checks do not validate packaged Desktop or unconfigured mail flows.

## Update and recover

Build images before updating runtime `RAYPX_RELEASE`, then deploy the same service.
Back up its database before migrations. Preserve project name and named storage.
Image rollback does not reverse schema changes; confirm compatibility first.
Use the exact Dokploy project name for manual `docker compose -p` operations.
Never use `down --volumes` or reset a deployment database.

## Digest and migration compatibility

Set `POSTGRES_IMAGE_DIGEST` to the verified 64-character manifest digest for
`postgres:17-alpine`; there is no floating-tag fallback. Resolve it from the
official registry in the deployment environment and retain the previous digest
for rollback. An unavailable registry is not evidence of a verified image.

All migrations must remain compatible with the old API: use expand/contract,
adding indexes/tables/optional fields first. A later release may remove the old
shape only after every consumer has migrated. The current control indexes are
additive. An image rollback must not require reversing a migration.

After backup and image builds, use `sh deploy/update.sh /absolute/path/to/.env`.
It validates Compose without printing secrets, records the running API/Web image
digests, waits for PostgreSQL, **stops API**, runs the isolated migration and then
replaces API and Web with health waits. Schedule a maintenance window for the whole
operation: the generated index migrations use transactional `CREATE INDEX` and
cannot serve device writes concurrently. Do not run a separate old API against
this database during migration. Migration connections use a ten-second lock timeout;
an unexpected external writer causes a bounded failure rather than an indefinite wait.
Generated migration history is unchanged. This is a single-API deployment with an
outage, rather than a zero-downtime replica rollout.
For releases containing these index migrations, disable Dokploy's automatic
redeploy and run the update script on the host during the agreed maintenance
window. An ordinary Compose reconciliation alone does not stop the old writer
before starting the migration job.

On migration failure the script restarts the untouched previous API container. On
API or Web replacement/health failure it stops the failed services and recreates
the previous running images by their immutable local digests. It returns failure
even if recovery succeeds. A first deployment has no previous image to restore;
failed services remain stopped. The script removes its protected temporary Compose
override on exit. Database schema is never rolled back automatically.

Before deployment retain the previous protected environment file, image digests
and a database backup separately. Image rollback uses the environment file passed
to the update; it cannot recover secrets or settings overwritten outside the script.
If automatic recovery fails, inspect `docker compose ... logs --tail 100 api migrate`
in a protected terminal, validate the previous environment with `config --quiet`,
then use a protected Compose override specifying the captured `sha256:` images and
`up -d --no-deps --wait api web`. Keep the same project name and volume. Verify
`/health`, `/ready`, login and relay before ending maintenance. Retain additive
migrations when reverting an application image; never delete migrations or volumes.

Deploy relay v2 Web/API/Desktop together. Older relay peers receive
`UPGRADE_REQUIRED`; new clients stop retrying a version mismatch.
