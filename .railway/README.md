# Raypx Railway application services

This configuration owns the named raypx-app partial for API, Web and Gateway.
Postgres, Redis and their volumes remain outside application ownership. Runtime
variables and secrets stay on Railway and are not managed by this file.
The application services track raypx/raypx on canary and deploy matching pushes.
API and Web use the same application Dockerfiles as Compose. API's final railway
target includes its isolated pre-deploy migration dependencies.

Use the pinned Bun toolchain and the scoped IaC preload when planning or applying.
Commands, variable references, migrations and the raypx.com domain cutover are
in [the deployment guide](../docs/development/railway.md).
