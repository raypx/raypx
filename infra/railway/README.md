# Raypx Railway application services

This configuration owns the named raypx-app partial for API, Web, Relay and Gateway.
Postgres, Redis and their volumes remain outside application ownership. Runtime
variables and secrets stay on Railway and are not managed by this file.
The application services track raypx/raypx on canary and deploy matching pushes.
API and Web use the same application Dockerfiles as Compose. API's default deploy
target includes its isolated pre-deploy Node migration bundle and SQL ledger.

Install dependencies from the repository root. Link the checkout to the existing
Raypx production environment, then run workspace commands from the root:

```sh
pnpm --dir infra/railway run check
pnpm --dir infra/railway run test
pnpm --dir infra/railway run plan
# Review the plan before applying.
pnpm --dir infra/railway run deploy
```

`plan` and `deploy` use the catalog-pinned Railway CLI under Node, select
`railway.ts` explicitly with `--file`, and evaluate it under Node. They are
uncached VP tasks. `deploy` applies infrastructure configuration; Railway builds
the application images from GitHub. Neither command runs during `check` or `test`.
The `railway` development dependency supplies the IaC program SDK; `@railway/cli`
supplies the command-line executable.

`railway.ts` is the package's public entry. `Dockerfile` and `Caddyfile` own the
gateway image; application Dockerfiles remain in `apps/api` and `apps/web`.
Variable references, migrations and the raypx.com domain cutover are documented
in [the deployment guide](../../docs/development/railway.md).

Moving these files or pushing `railway.ts` does not update Railway's live build
settings. Use `plan`, review the complete application partial, then `deploy` to
apply configuration changes; runtime variables remain operator-managed. Gateway
must build from the repository root using `infra/railway/Dockerfile`. For stale
paths, missing upstreams or failed healthchecks, follow the
[Gateway recovery checklist](../../docs/development/railway.md#recover-gateway-after-a-configuration-move).
