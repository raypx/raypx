# Compose deployment and environments

Every Dokploy Compose service uses the same `deploy/build.sh` and
`deploy/compose.yaml`. Each project supplies its own environment variables.
`deploy/.env.example` is the common template; there is no beta/production branch
or credential discovery in the scripts.

## Project boundaries

Dokploy runs Compose with its service's unique project name (`appName`). Use that
exact value as `COMPOSE_PROJECT_NAME` when prebuilding images. For a manual
installation, choose a unique project name and keep it stable across updates.

- Image tags are `raypx/api:<project>-<release>`, `raypx/web:<project>-<release>`
  `raypx/relay:<project>-<release>` and `raypx/api-migrate:<project>-<release>`.
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
database. See [Beta environment](#beta-environment) for the original deployment's transition.

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

The template also forwards optional `AUTH_DOMAIN`, `MAIL_DEFAULT_LOCALE`,
Google/GitHub OAuth credentials (see [social login](accounts.md#social-login)),
S3 storage settings and server `POSTHOG_PROJECT_TOKEN`/`POSTHOG_HOST`.
`REDIS_URL` is required for the private broker shared by API and Relay.
Empty optional values keep the corresponding integration disabled. These settings
do not provision Redis, storage or mail services; supply the intended environment's
endpoints and credentials. Browser analytics uses its separate public build values.

`@raypx/tooling/build/deployment` owns service ports, readiness paths and API ingress
routes. Vite and Railway use that contract directly. `pnpm run policy` checks the
static Compose, Docker and Caddy adapters against it, and rejects API settings
missing from Compose or the environment template.

## Build

```sh
COMPOSE_PROJECT_NAME=raypx-app APP_HOST=app.example.com RAYPX_RELEASE=git-sha sh deploy/build.sh
```

The script builds migration, API, Relay and Web sequentially. It creates
`RAYPX_BUILD_BUILDER` (default `raypx-builder`) on first use. Creation limits default
to two CPUs, 3 GiB memory and 4 GiB memory plus swap. `BUILD_MEMORY`,
`BUILD_MEMORY_SWAP` and `BUILD_CPU_QUOTA` override creation settings; the fixed CPU
period is 100000 microseconds, so quota 200000 means two CPUs. Change existing
limits explicitly or choose a new builder name. A stopped builder starts on the
next build. Reuse one bounded builder for the shared manifest and dependency image layers.

Build and runtime stages use the pinned `node` images; Node is the only runtime.
Compose and Railway use `apps/api/Dockerfile`, `apps/web/Dockerfile` and
`infra/relay/Dockerfile`. Relay bundles its Node entry with Vite.
These portable files have no platform-specific cache IDs. `deploy/build.sh` adds
local pnpm download cache mounts to a temporary Dockerfile and removes
it on exit, including build failure. All install/build commands remain in the
application Dockerfiles. Compose explicitly selects the API's `migrate` and
`runtime` targets; the default `deploy` target additionally carries the bundled
Node migration command for Railway's isolated pre-deploy hook.
The server images use manifest/dependency layering: `deploy/manifests.ts` extracts
package manifests, `pnpm-lock.yaml` and generated pnpm workspace config, so source
edits reuse installed dependencies and only dependency metadata changes reinstall.
The script discovers workspaces through `deploy/workspaces.ts` and stages bin
placeholders so pnpm can link workspace commands before source is copied. Each
Dockerfile installs its service and root tooling dependency closures, excluding
unrelated server and platform dependencies. Compose shares pnpm downloads across
these installs with its local cache mount. The build script supplies
`VITE_APP_RELEASE` because Docker contexts omit `.git`.

Image builds pass `--no-cache` to VP while retaining its task graph and type-check
prerequisites. VP's automatic file tracking installs seccomp listeners for static
executables such as esbuild. A build sandbox with an existing listener rejects
that installation with `spawn EBUSY`. Docker layer caching still reuses dependencies
and completed build steps. For a direct build in such a sandbox, run
`pnpm run build:api --no-cache` (or the corresponding Web/Relay command).

The API provides three deployable targets: `migrate` is an isolated database job,
`runtime` contains only the API output, and the default `deploy` target extends
`runtime` with migration artifacts for pre-deploy hooks. The `migration-build`
stage bundles `packages/database` as Node ESM; both migration-capable targets
copy `dist/` and the unchanged `drizzle-foundation/` SQL ledger. Their command is
`node migration/dist/commands.mjs migrate`; no repository source or installed
package tree is required at migration runtime. Deployment acceptance explicitly
builds the separate `fixture` target, which contains the compiled synthetic account
provisioner. Ordinary image builds skip that compilation and payload. All runtime
targets use the unprivileged `node` user.

Railway builds the default `deploy` target; Web defaults to `runtime` on both
platforms. The shared Dockerfiles use layer caching without cache mounts, whose
service-specific IDs would tie the files to Railway. Manifest or lockfile changes
can require a fresh download; source-only changes reuse the installed dependency layer.

## Host and deploy

Use SSH keys, verify a second key connection before disabling password login and
keep Dokploy's port 3000 behind an SSH tunnel. Both host and Docker forwarding
firewalls must block public management access. Allow TCP 22, 80 and 443; UDP 443 is
optional for HTTP/3. Only Traefik publishes application traffic.

Point `APP_HOST` at the host. `TRAEFIK_NETWORK` defaults to `<COMPOSE_PROJECT_NAME>-ingress`, which
must already exist and contain only this project's Web/API/Relay containers and Traefik.
Create a distinct network for each project and explicitly connect Traefik with a
stable address. Do not attach application containers to the shared Dokploy network. Set the certificate account email before requesting TLS using
`TRAEFIK_CERT_RESOLVER` (default `letsencrypt`). Check public HTTPS
and the origin certificate when using a reverse proxy. Web and API share an origin for cookies and relay.

Set Traefik entry-point `forwardedHeaders.trustedIPs` to trusted edge ranges.
`AUTH_IP_HEADERS=x-forwarded-for` and `AUTH_TRUSTED_PROXIES` include those ranges
plus Traefik's exact `/32` or `/128` address. Never trust an entire shared Docker
subnet. The server entry verifies the real socket peer before accepting forwarding
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
API startup also applies pending migrations by default. Its output bundles the SQL
as private Nitro server assets, so this works with the standalone runtime image and
a relocated `.output` directory. Set `DATABASE_MIGRATE_ON_START=false` to skip the
API startup step. This switch does not disable explicit migration jobs or Railway's
pre-deploy hook: these remain in place before Relay/API replacement. Repeated startup
checks apply only pending migrations. All entry points share a transaction-scoped
PostgreSQL advisory lock before reading the migration ledger, waiting up to 120 seconds
for another migrator; subsequent DDL lock waits remain capped at ten seconds.
Any migration failure aborts API startup without opening the application runtime.
The SQL staging directory is removed after each attempt, and startup errors expose
neither connection details nor SQL. Existing database backups and maintenance-window
requirements still apply.
The independent Relay and API share an explicit private `REDIS_URL` and PostgreSQL.
Gateway `/relay` traffic reaches Relay directly; API owns HTTP authentication and
RPC. The broker has no offline queue or automatic delivery retry.
Configured Redis outages disconnect Relay clients and fail its readiness probe;
`/health` remains liveness-only. Keep the broker private to this deployment.
The provided Compose update script still manages one API container.
`POSTGRES_MEMORY`/`POSTGRES_CPUS`, `MIGRATE_MEMORY`/`MIGRATE_CPUS`,
`API_MEMORY`/`API_CPUS`, `RELAY_MEMORY`/`RELAY_CPUS` and `WEB_MEMORY`/`WEB_CPUS` configure runtime limits. Budget
for all projects, Dokploy and builds on a shared host.

Check `/health`, database-aware `/ready`, signed-out redirects, real login,
WebSocket upgrades and that images/routes/volumes belong to the intended project.
Browser checks do not validate packaged Desktop or unconfigured mail flows.

Run `pnpm run smoke:deployment` to build and exercise both deployment image targets
locally. The shared checks cover migrations, dependency readiness, guest SSR,
assets, authenticated sessions, secure cookie attributes, Relay and recorded build
release metadata. See [validation evidence](validation-artifacts.md) for isolation,
cleanup and the limits of this local acceptance.

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
It validates Compose without printing secrets, records the running API/Relay/Web image
digests, waits for PostgreSQL, **stops API and Relay**, runs the isolated migration and then
replaces Relay, API and Web with health waits. Schedule a maintenance window for the whole
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

On migration failure the script restarts the untouched previous API and Relay containers. On
Relay, API or Web replacement/health failure it stops the failed services and recreates
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
`up -d --no-deps --wait api relay web`. Keep the same project name and volume. Verify
`/health`, `/ready`, login and relay before ending maintenance. Retain additive
migrations when reverting an application image; never delete migrations or volumes.

Deploy relay v4 Web/API/Desktop together. Older relay peers receive
`UPGRADE_REQUIRED`; new clients stop retrying a version mismatch.

The CI deployment gate runs for deployment adapters, API/Web runtime or dependency
changes, shared build inputs and full release verification. It uses the same
`smoke:deployment` acceptance as local verification and must pass when selected.
Ordinary browser component/style changes use source gates; full release verification
still exercises the images.
Only `results.json` and `commands.json` are uploaded; raw subprocess logs stay local.
API environment keys come from `apps/api/server/env.contract.ts`, whose exact keys
are enforced by the runtime schema. Policy reads this static catalog without
executing app code or loading environment files, and checks runtime Docker stages
including inherited Railway settings.

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

Release from a verified `canary` commit. Build the migration, API, Relay and Web images
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

New image tags use `<compose-project>-<release>`. Build the new tags, or explicitly
alias old images after verifying they were built for the same hostname and source
version. For example, original `beta-20261024-01` images can keep source version
`20261024-01` under the existing Compose project's image prefix.

To keep the original bounded builder and caches, set
`RAYPX_BUILD_BUILDER=raypx-beta-builder` on that host. The shared default for new
hosts is `raypx-builder`. Hostnames, credentials and storage are explicit values;
the scripts do not infer or migrate existing resources.
