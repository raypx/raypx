# Compose deployment and environments

The default topology is Web + one Bun backend + PostgreSQL. `apps/api` builds a
single Nitro artifact; `SERVER_ROLE=all` is the default and hosts API, durable Run
recovery and `/relay` together. New Runs start directly in the committing process;
workers recover lost starts, expired leases and handed-over attempts through
PostgreSQL only. Redis is optional for caches and the retained device Relay
transport. See the [execution guide](../architecture/execution.md).

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

Use URL-safe `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` for the
database owner. Set a separate `POSTGRES_RUNTIME_PASSWORD` of 16–128 URL-safe
characters and, if needed, override `POSTGRES_RUNTIME_USER` (default
`raypx_runtime`). The migration job provisions the runtime login and grants
data access in the same transaction as schema changes. Use a dedicated runtime
role per database on a shared PostgreSQL cluster. API and Relay receive that
login, and only the migration job receives the database owner connection. `AUTH_SECRET` and `APP_KEY` must be independent per
project and differ from each other: `AUTH_SECRET` signs sessions, `APP_KEY`
encrypts stored provider credentials and signs instance receipts, so replacing it
requires re-entering those credentials and re-enrolling instances. All
production API-enabled roles require explicit database, both secrets, HTTPS auth URL
and exact allowed origins. `POSTGRES_IMAGE_DIGEST` must be the verified
64-character manifest digest for postgres:17-alpine. Keep its prior value for
rollback. No floating-tag fallback is provided.

`POSTGRES_VOLUME_NAME` optionally selects known existing foundation storage.
Never discover another project's volume, reuse a retired database or run these
migrations against an operator database. New projects use their own isolated
volume and credentials.

Account mail and storage are set in the [configuration center](configuration.md).
Set `DB_MIGRATE_IMPORT_CONFIG=true` and provide the existing provider inputs
for the Compose migration job when upgrading an environment-based configuration.
Remove the import flag and inputs after the migration succeeds.
Optional OAuth, analytics and cookie domain settings are explicit in the template.
`AGENT_MODELS` and protected `AGENT_MODEL_CREDENTIALS` configure the initial backend
reply executor; both default to empty JSON containers. See the
[execution guide](../architecture/execution.md#deployment-model-configuration).
Any number of API and worker processes can execute Runs using fenced leases.
Committed reply events reach every API process through PostgreSQL fanout; transient
prefixes remain local to the executor. A client connected to another process
receives the committed segment when that model turn finishes.
`JOBS_ENABLED` enables server
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
job) and default `deploy` (runtime plus pre-deploy migration payload). Both carry
the bundled `db:migrate` command and canonical SQL.
Compose runs the migration job before replacing the backend and disables API
startup migrations. Direct API invocations can still enable startup migrations
with an owner connection. Every migration path shares the transaction advisory
lock and ledger.

Only Traefik publishes traffic. Keep the management panel behind SSH and block
public database/application ports. Set APP_HOST, DNS, TLS and the exact project
TRAEFIK_NETWORK. Attach only this project's containers and Traefik. Trust exact
proxy /32 or /128 addresses in AUTH_TRUSTED_PROXIES; never trust a shared subnet.
Traefik sends /api/, /rpc/, /events, /health, /ready and /relay to the backend; other paths
go to Web. It strips Cookie and Authorization only on the relay route.

Validate without printing resolved secrets:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
```

## Optional computers

The default `COMPUTER_PROVIDER=none` keeps every other backend capability available.
To enable isolated computers, build the supervisor and computer images separately;
`build.sh` still builds the three required application images only. Supply verified
manifest digests for `oven/bun:1.4.4` and `python:3.13-slim-bookworm`; there is no
floating base fallback. Build from the repository root, without a secret build arg:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile sandbox build sandbox
docker build -f infra/sandbox/Computer.Dockerfile --build-arg BUN_IMAGE_DIGEST="$BUN_IMAGE_DIGEST" --build-arg COMPUTER_BASE_DIGEST="$COMPUTER_BASE_DIGEST" -t raypx/computer:prepared .
```

Publish the prepared computer image to an operator-controlled registry if needed,
record its immutable digest, and preload it into the selected Engine. Set
`SANDBOX_COMPUTER_IMAGE` to that digest reference. For a local build, an immutable
`sha256:<64 lowercase hex>` Engine image ID from `docker image inspect --format '{{.Id}}'
raypx/computer:prepared` is also accepted; mutable tags are rejected. Provision never pulls or builds.
The image contains a shell, coreutils, git, Python 3.13 and the repository-pinned Bun.
Use an Engine supporting API v1.47. Generate a new, dedicated 32+ character
`SANDBOX_SUPERVISOR_TOKEN`; it must differ from authentication, encryption, model
and other credentials. Pass it only to the backend and supervisor. Set
`COMPUTER_PROVIDER=docker` and `SANDBOX_SUPERVISOR_URL=http://sandbox:4020`.

Start the opt-in profile explicitly:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile sandbox config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile sandbox up -d sandbox
```

Recreate API with the updated protected settings through the usual deployment
workflow. The supervisor publishes no port. It binds its explicit private IP on
`sandbox-control`; the API joins that network without receiving a socket mount.
The default address/subnet are `172.30.40.2` and `172.30.40.0/24`; override both
for each project if they overlap another network. Keep the configured listener IP
inside that subnet. Only the supervisor mounts `/var/run/docker.sock`; treat its
socket access as host control. Its separate `sandbox-state` volume stores metadata,
generation tombstones and immutable snapshots. Run one supervisor per state volume.
Back it up with PostgreSQL; do not delete it during image replacement.
Compose builds that service from `infra/sandbox/Dockerfile` with `BUN_IMAGE_DIGEST`
from the protected environment. For rootless or Colima sockets, set
`SANDBOX_ENGINE_SOCKET` to the absolute Engine-host socket path; Compose maps it
to `/var/run/docker.sock` inside the supervisor only. These configurations still
need their own acceptance; a socket path alone does not establish isolation.

`SANDBOX_MEMORY_BYTES`, `SANDBOX_NANO_CPUS` (one CPU = 1,000,000,000) and
`SANDBOX_PIDS_LIMIT` are positive decimal ceilings; malformed settings fail startup
and name the setting. Computers run as UID/GID 1000, with no privileges or host
network, read-only root, bounded tmpfs, their own home volume and a private anonymous
helper-input volume at `/run/raypx`. Container removal also removes that helper volume.
`COMPUTERS_PER_SPACE` and `COMPUTERS_PER_MEMBER` cap retained records (defaults 1
and 10). Stopped homes still count. API stores no command output or file content
through these lifecycle procedures.

For restricted egress, use [`infra/sandbox/egress.sh`](../../infra/sandbox/egress.sh)
on the Linux Docker Engine host. Its bridge is `rpx` plus the first ten hex
characters of SHA-256 of `SANDBOX_NAMESPACE` (the Compose project name in this
profile). After a computer has created the bridge, derive its name without a
secret and review the rules:

```sh
bridge="$(printf %s "$COMPOSE_PROJECT_NAME" | sha256sum | cut -c1-10)"
bridge="rpx$bridge"
sh infra/sandbox/egress.sh --bridge "$bridge" --dry-run
sudo sh infra/sandbox/egress.sh --bridge "$bridge" --apply
# Remove only this bridge's owned rules when retiring it:
sudo sh infra/sandbox/egress.sh --bridge "$bridge" --remove
```

Apply/remove are idempotent and scoped to the supplied bridge. Apply requires the
bridge in the current host namespace, root, `iptables`, `ip6tables` and Docker's
iptables backend with `DOCKER-USER`; native nftables Docker networking is unsupported.
The script refuses an existing hook displaced behind another rule; review host
policy and restore its priority explicitly before retrying. It blocks all traffic
from computers to the host, and private/reserved IPv4 destinations before and after
DNAT, including LAN, link-local and cloud metadata. Public IPv4 returns to Docker's
normal forwarding/NAT policy; computer IPv6 egress is denied. Reapply after host
firewall resets and verify whenever Docker or firewall configuration changes.
The rules do not persist across reboot automatically.

Keep computers stopped while establishing and verifying restriction. Only then set
both `SANDBOX_RESTRICTED_EGRESS=true` and `SANDBOX_HOST_RULES_APPLIED=true` in the
supervisor environment and recreate it. It reports unrestricted egress otherwise;
those settings are operator assertions, not automated firewall verification.
Apply rules inside the Engine VM for macOS/Colima. Rootless/remote network
namespaces require a separate supported host policy and are not accepted here.

Offline tests use a fake Engine HTTP transport and never start listeners. The
owned real-Engine gate needs no prepared service or operator token:

```sh
bun run raypx-dev test sandbox
bun run raypx-dev test sandbox --engine-socket "$HOME/.colima/default/docker.sock"
# Explicitly authorizes temporary firewall changes on the Linux Engine host:
bun run raypx-dev test sandbox --with-egress
```

It builds from resolved base digests, creates a source supervisor on loopback,
runs conformance and isolation/home probes, then tears down only its resources.
Egress is not run without the explicit flag and supported OS/privileges. Details
and evidence are in [validation artifacts](validation-artifacts.md#owned-sandbox-real-engine-acceptance).
To run just conformance against an already prepared isolated supervisor:

```sh
RAYPX_TEST_DOCKER=1 SANDBOX_SUPERVISOR_URL=http://127.0.0.1:4020 SANDBOX_SUPERVISOR_TOKEN="$SANDBOX_SUPERVISOR_TOKEN" bun run --cwd packages/providers test -- tests/computer/conformance.test.ts
```

This opt-in suite creates and destroys only its own UUID computers. It retains
revision tombstones/snapshots under the supervisor's normal retention policy.
Also verify per platform: a command cannot read the Engine socket or another
Space's home, cannot use host networking, respects memory/CPU/PID limits, and can
reach public internet but not host/LAN/metadata when restricted egress is asserted.
Restart the supervisor and Engine, replace a computer, and inject a restore failure
to verify fencing and preservation of the last committed revision. These real
Engine and firewall checks are required before describing isolation as accepted.

The only recorded real-Engine acceptance is manual provider conformance on macOS
arm64 with Docker Engine 29.5 through Colima (`77a9421c`, 10/10). No real run of the
new gate, Ubuntu/Linux amd64 or arm64, macOS x64/other Engine configurations,
Windows, rootless engines or restricted egress is recorded. Compose profile
syntax/property tests do not establish real deployment or firewall acceptance.

Existing explicit `SERVER_ROLE=both` settings continue to run the combined backend
with recovery enabled. New environment files use `all`.

## Optional split roles

`deploy/compose.split.yaml` overlays the default topology with `api`, `worker`
and `relay`, all using the same backend image. API accepts HTTP/RPC/events and
starts message work directly. Worker exposes health/readiness only, needs no
sign-in, mail, cookie, signing or broker configuration, and runs startup and
periodic recovery scans. The worker receives the same model catalog, credential
selectors and Computer provider settings as API so pinned resources remain
available. All roles use the same isolated foundation PostgreSQL and port 3002
inside their own container; only API/Relay join ingress.

Durable Runs need no Redis. The retained device transport still needs a private
`REDIS_URL` when API and Relay are separate processes; without that optional
integration, its remote dispatch is explicitly unavailable. Relay itself accepts
only database, optional broker and allowed origins, and performs no migrations.
The Compose migration job runs before every role replacement. `update.sh --split`
includes worker capture, graceful stop, replacement and image rollback.

`RUN_RECOVERY_INTERVAL_MS=5000`, `RUN_LEASE_MS=15000`,
`RUN_HEARTBEAT_MS=5000`, `RUN_ATTEMPT_TIMEOUT_MS=300000` and
`RUN_BACKUP_MARGIN_MS=30000` configure recovery. Keep at least two heartbeat
intervals in each lease. A crash becomes recoverable after lease expiry; a clean
stop releases immediately. The backup due time is the attempt deadline plus its
margin. Configure matching values across roles. The Nitro Bun server allows 25
seconds to drain HTTP requests (longer than the 15-second RPC deadline). Compose
allows 30 seconds before forced termination, leaving five seconds for fenced
lease handover and resource cleanup after the drain.

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
with health waits. --split also captures/stops/replaces Relay and worker. Transactional index
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

Each backend process coalesces concurrent PostgreSQL and Redis readiness probes
and reuses completed results for one second. The API's `/ready` and authorized
administrator health check share these results. Relay status is read on demand.
Slow probes return `unavailable` after three seconds and remain the only probe
for that dependency until the driver settles. `/ready` uses `Cache-Control: no-store`.

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

Mail requires a Resend key and verified sender in the [configuration center](configuration.md#resend-email).
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
