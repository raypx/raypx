# Deployment

This directory owns Dokploy Compose deployment and shared image source staging.
Build from the repository root with `build.sh`; Compose and Railway share the
Dockerfiles in apps/api and apps/web. Keep install/build commands in those files.
`workspaces.ts` discovers Bun workspace patterns from the root manifest before
project dependency installation. Docker uses the same pinned Bun runtime.
`manifests.ts` stages workspace metadata before dependency installation. Each
service installs its own workspace dependency closure and root build tools through
Bun filters. API's `migration-payload` bundles the explicit migration command
with its production imports and canonical SQL for `migrate` and `deploy`.
Deployment acceptance separately
bundles its synthetic account fixture and mounts it read-only into the migration
image; production images do not build or ship that fixture.
`build.sh` adds Compose-only Bun cache mounts to temporary copies and removes them on exit.
Deployment smoke sets `RAYPX_BUILD_INSTALL_CACHE_MOUNTS=0` so both profiles build the
original Dockerfiles in the same builder.
Image builds run the API and Web `check` and `build` scripts directly in the
Git-free build context. Docker layers own image build caching.
Use the service/ingress contract in `@raypx/tooling/build/deployment`; `policy`
checks static adapters and API environment forwarding. Run `smoke:deployment`
for isolated image acceptance; its fixture account and database must remain owned
and synthetic. Do not convert that fixture into an operator account command.
Read `docs/development/deployment.md` before changing deployment behavior.
Railway infrastructure and the gateway belong to the `infra/railway` workspace; see
`docs/development/railway.md`. Its gateway publishes the shared origin while API,
Web, Postgres and Redis communicate over Railway's private network. Keep existing
database services and volumes outside the application's named IaC partial.
The rules below apply to the Compose host workflow.

- Read deployment configuration from explicit environment variables. Do not infer
  credentials or hostnames from Git branches or server state.
- Use the Compose project name for image and route namespaces; networks and
  default volumes are project-scoped. Keep credentials and data per project.
- Existing named storage is opt-in through POSTGRES_VOLUME_NAME; never discover
  or reuse another project's volume automatically.
- Only Traefik publishes application traffic. Database and application containers
  have no published host ports; the management panel stays behind SSH.
- Default to one combined backend without Redis. compose.split.yaml selects api/relay roles
  from the same image; both split roles require Redis. update.sh --split selects that topology.
- Run additive, backward-compatible migrations against that environment's isolated database before replacing API or Relay. Use update.sh; migration failure must preserve the old API and Relay.
- Require a digest-pinned PostgreSQL image and a project-private Traefik ingress network. Trust exact proxy addresses, never a shared container subnet.
- Build versioned images sequentially with a bounded container builder. Preserve
  previous image versions and persistent volumes for rollbacks.
- Keep only the migration bundle and SQL in the migration image. It must not
  inherit the API build or development tools. Reuse manifest/dependency build layers.
- Compose and Railway share apps/api/Dockerfile and apps/web/Dockerfile.
  Keep cache mounts out of these portable files; Railway requires service-specific IDs.
- Only the migration job receives the database owner connection. Compose runtime services
  use the restricted login provisioned by that job, with startup migration disabled.
- Credentials belong in protected host files or Dokploy environment settings;
  examples contain no credentials. Never print resolved Compose environment values.

Verify Compose syntax with `config --quiet`, build both real images, and probe
HTTPS, database readiness and login. Do not count missing mail delivery as passed.
