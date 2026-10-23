# Beta deployment

This directory owns the single-server Node beta stack managed by Dokploy Compose.
Build from the repository root with `build.sh`; Dockerfiles remain with Web/API.
Read `docs/development/beta.md` before changing deployment behavior.

- Keep the beta database and named volume separate from all other environments.
- Only Traefik publishes application traffic. Database and application containers
  have no published host ports; the management panel stays behind SSH.
- Keep one API process because Node relay routing has process-local authority.
- Run migrations against the isolated beta database before starting the API.
- Build versioned images sequentially with a bounded container builder. Preserve
  previous image versions and persistent volumes for rollbacks.
- Credentials belong in protected host files or Dokploy environment settings;
  examples contain no credentials. Never print resolved Compose environment values.

Verify Compose syntax with `config --quiet`, build both real images, and probe
HTTPS, database readiness and login. Do not count missing mail delivery as passed.
