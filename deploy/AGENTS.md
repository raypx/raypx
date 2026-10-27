# Single-server deployment

This directory owns the shared Node deployment managed by Dokploy Compose.
Build from the repository root with `build.sh`; Dockerfiles remain with Web/API.
Read `docs/development/deployment.md` before changing deployment behavior.

- Read deployment configuration from explicit environment variables. Do not infer
  credentials or hostnames from Git branches or server state.
- Use the Compose project name for image and route namespaces; networks and
  default volumes are project-scoped. Keep credentials and data per project.
- Existing named storage is opt-in through POSTGRES_VOLUME_NAME; never discover
  or reuse another project's volume automatically.
- Only Traefik publishes application traffic. Database and application containers
  have no published host ports; the management panel stays behind SSH.
- Keep one API process because Node relay routing has process-local authority.
- Run additive, backward-compatible migrations against that environment's isolated database before replacing API. Use update.sh; migration failure must preserve the old API.
- Require a digest-pinned PostgreSQL image and a project-private Traefik ingress network. Trust exact proxy addresses, never a shared container subnet.
- Build versioned images sequentially with a bounded container builder. Preserve
  previous image versions and persistent volumes for rollbacks.
- Keep the migration image on database production dependencies; it must not
  inherit the API build or development tools. Share Bun/VP BuildKit caches.
- Credentials belong in protected host files or Dokploy environment settings;
  examples contain no credentials. Never print resolved Compose environment values.

Verify Compose syntax with `config --quiet`, build both real images, and probe
HTTPS, database readiness and login. Do not count missing mail delivery as passed.
