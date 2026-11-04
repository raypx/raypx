# Railway deployment

The Railway project is [raypx](https://railway.com/project/766ffb45-d60f-4e4d-83b1-135443ff0b51),
environment production, in Singapore. Its data and authentication secret are independent
of the Dokploy Beta and Production projects.

## Services and configuration

The named IaC partial in [infra/railway/railway.ts](../../infra/railway/railway.ts) manages
api, web, relay and gateway. Existing Postgres and Redis services and their volumes
remain outside this partial. Both were inspected and empty before the initial
foundation migration. Keep their images and persistent storage intact.

The private `@raypx/infra-railway` Bun workspace owns the SDK/CLI dependencies,
IaC entry, gateway assets and offline tests. Run `bun run --cwd infra/railway check`
and `test` for focused validation; root `check`, `test` and `verify` discover it
through the root manifest's `infra/*` pattern.

Gateway uses the pinned Caddy image and [Caddyfile](../../infra/railway/Caddyfile).
Railway terminates public HTTPS on port 8080. Gateway routes `/api/*`, `/rpc/*`,
/health and /ready to API; `/relay` goes to Relay and other paths go to Web. Caddy proxies WebSocket
upgrades; API and Web have no public domains, and database connections use private
references. Access logging is
disabled and the error log removes request details.

API, Web and Relay bind to :: for Railway private networking. IaC defaults to one API
replica. Relay replicas share PostgreSQL and Redis; API replicas also share
AUTH_SECRET. Relay never receives that secret. Keep broker channels private to
this deployment. All four application services
stay awake. Forwarded client IP headers remain untrusted until explicit, verified
proxy CIDRs are configured; the API uses its socket peer by default.

Runtime variables are deliberately unmanaged by IaC. This preserves secrets and
operator settings on Railway. Configure references in the dashboard or with
railway variable set --skip-deploys; never commit decrypted variables.

| Service  | Variables                                                                                                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gateway  | PORT=8080; PUBLIC_ORIGIN is the current HTTPS origin; API_UPSTREAM=${{api.RAILWAY_PRIVATE_DOMAIN}}:3002; WEB_UPSTREAM=${{web.RAILWAY_PRIVATE_DOMAIN}}:3000; RELAY_UPSTREAM=${{relay.RAILWAY_PRIVATE_DOMAIN}}:3003 |
| api      | NODE_ENV=production; HOST=::; PORT=3002; NITRO_PORT=3002; DATABASE_URL=${{Postgres.DATABASE_URL}}; REDIS_URL=${{Redis.REDIS_URL}}; AUTH_SECRET is a private random value of at least 32 characters                |
| api      | AUTH_URL=${{gateway.PUBLIC_ORIGIN}}; ALLOWED_ORIGINS includes that origin, https://raypx.com, views://main and raypx://; JOBS_ENABLED=true                                                                        |
| web      | NODE_ENV=production; HOST=::; PORT=3000; NITRO_PORT=3000; VITE_API_URL=${{gateway.PUBLIC_ORIGIN}}                                                                                                                 |
| relay    | NODE_ENV=production; HOST=::; PORT=3003; DATABASE_URL=${{Postgres.DATABASE_URL}}; REDIS_URL=${{Redis.REDIS_URL}}; ALLOWED_ORIGINS matches API                                                                     |
| api, web | VITE_APP_RELEASE optionally overrides the build release; otherwise the Docker build uses Railway's RAILWAY_GIT_COMMIT_SHA                                                                                         |

Optional mail, administrator, storage and analytics settings remain explicit
per-environment settings. Without RESEND_API_KEY and a verified MAIL_FROM, mail
actions retain the MAIL_NOT_CONFIGURED guard. Never bypass verification for real users.
Both Dockerfiles declare `RAILWAY_GIT_COMMIT_SHA` as a build argument. Manual builds
outside Git must supply it or `VITE_APP_RELEASE`; no unversioned production fallback
is generated. Client assets record the resolved version for later SourceMap upload.
Service ports and health paths come from `@raypx/tooling/build/deployment`; repository
policy checks Caddy and Compose against the same ingress contract.

## Apply and deploy

API, Web, Relay and Gateway use the raypx/raypx GitHub repository's canary branch.
Matching pushes trigger automatic deployments using the shared
`apps/api/Dockerfile` and `apps/web/Dockerfile` and each service's watch patterns.
Shared package or manifest changes rebuild API and Web;
both services also watch `deploy/*.ts` for shared build-context preparation changes.
Relay uses `infra/relay/Dockerfile`, watches `infra/relay/**` and shared build inputs,
and probes `/ready`. Gateway watches its proxy configuration and the IaC file.
Provision Relay and set `RELAY_UPSTREAM` before publishing the split gateway/API;
see [the independent service](../../infra/relay/README.md).
Infrastructure changes still require config plan/apply: Railway does not apply
the IaC authoring file simply because it was pushed.

API and Web require `apps/api/Dockerfile` and `apps/web/Dockerfile`; Gateway requires
`infra/railway/Dockerfile`. Its Docker build context remains the repository root.

For a Dockerfile path cutover, pause the affected service's GitHub autodeploys, review
`config plan`, then apply the new paths and watch patterns. Keep any
`RAILWAY_DOCKERFILE_PATH` variable aligned with the same shared path. Deploy the
latest commit for API, wait for readiness, then deploy Web and verify it before
re-enabling autodeploys. Pushing the IaC file alone does not update live settings.

### Recover Gateway after a configuration move

If Gateway still points at `deploy/railway/Dockerfile`, its live settings predate
the move to the infrastructure workspace. The old Dockerfile and Caddyfile no
longer exist. Do not restore copies at the old paths: update Railway's settings
to match the current [IaC definition](../../infra/railway/railway.ts).

Pause Gateway's GitHub autodeploys while correcting the settings. In Gateway's
service settings, confirm the following values:

| Setting                    | Value                                                   |
| -------------------------- | ------------------------------------------------------- |
| Repository / branch        | `raypx/raypx` / `canary`                                |
| Root Directory             | Repository root (`/`); do not set it to `infra/railway` |
| Builder                    | Dockerfile                                              |
| Dockerfile Path            | `infra/railway/Dockerfile`                              |
| Custom Start Command       | Unset; use the Dockerfile's Caddy command               |
| Healthcheck Path / timeout | `/ready` / 180 seconds                                  |
| Public domain target port  | `8080`                                                  |

Replace Gateway's Watch Paths with these four entries:

```text
infra/railway/Dockerfile
infra/railway/Caddyfile
infra/railway/railway.ts
.dockerignore
```

Remove the old `deploy/railway/*` and `.railway/railway.ts` entries. Watch Paths
control automatic deployment triggers; they do not change the Dockerfile path or
repair an existing failed build. The Dockerfile copies `infra/railway/Caddyfile`
relative to the repository root, so narrowing the build context breaks `COPY`.

Check whether Gateway has a service or shared `RAILWAY_DOCKERFILE_PATH` override.
If present, align its effective value with `infra/railway/Dockerfile`; leave it
unset if there is no override. Confirm `PORT=8080` and all three upstream
references in the variables table above, including `RELAY_UPSTREAM`. Never copy
API authentication secrets into Gateway.

For the normal IaC workflow, log in and link the project using the commands below,
then run `plan`. Review changes for the entire `raypx-app` partial before running
`deploy`: it manages API, Web, Relay and Gateway, not just Gateway. Stop if the plan
would delete or take ownership of Postgres, Redis or their volumes. Runtime
variables remain unmanaged and must be corrected separately. A manual dashboard
repair should match this same definition so the next apply preserves it.

Once settings are saved or applied, deploy the latest `canary` commit. Retrying
the old failed deployment may still use a commit from before the move. Wait for
API, Web and Relay to be healthy before verifying Gateway, then restore GitHub
autodeploys. Do not rotate secrets, reset databases or rerun migrations to repair
a Gateway path error.

### Diagnose the failing stage

| Symptom                                                   | Check                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Dockerfile not found / failed to read Dockerfile          | Effective Dockerfile path, overrides, selected commit and repository root                                                                  |
| `COPY` cannot find Caddyfile / checksum calculation fails | Repository-root build context, current `infra/railway/Caddyfile` and `.dockerignore`                                                       |
| Caddy configuration fails at startup                      | Runtime `API_UPSTREAM`, `WEB_UPSTREAM` and `RELAY_UPSTREAM`; build-time validation uses placeholders and does not verify Railway variables |
| Healthcheck `/ready` fails                                | Gateway port and logs, then API private DNS, port `3002` and readiness; Gateway forwards `/ready` to API                                   |
| Gateway is healthy but pages return 502                   | Web private DNS, port `3000`, and Web readiness; Gateway readiness only checks the API route                                               |
| Pages work but remote connections fail                    | Relay service, private DNS, port `3003`, `RELAY_UPSTREAM`, and the authenticated `/relay` WebSocket flow                                   |

After deployment, check the public HTTPS origin, `/ready`, SSR assets, login and
Relay connectivity separately. A green Gateway healthcheck does not prove Web or
Relay is healthy. Preserve the failing commit, deployment ID and relevant build
or runtime error lines when requesting help; omit credentials and decrypted
variables. Offline repository checks validate the checked-in configuration, not
the current Railway dashboard settings or live deployment health.

### CLI workflow

Install the repository dependencies with the pinned Bun. CLI 5.71.0 and SDK 3.16.0
were used for the initial deployment. Railway's legacy railway.toml configuration
has been replaced by its [current IaC interface](https://docs.railway.com/infrastructure-as-code).

Run these commands from the repository root. The CLI version is pinned in the
development catalog and installed by the infrastructure workspace:

```sh
mise exec -- bun ./infra/railway/node_modules/@railway/cli/bin/railway.js link --project 766ffb45-d60f-4e4d-83b1-135443ff0b51 --environment production
mise exec -- bun run --cwd infra/railway plan
# Review the plan before applying; the deploy command runs config apply.
mise exec -- bun run --cwd infra/railway deploy
# Uploads use the repository root as their build context.
mise exec -- bun ./infra/railway/node_modules/@railway/cli/bin/railway.js up --service api --detach
mise exec -- bun ./infra/railway/node_modules/@railway/cli/bin/railway.js up --service web --detach
mise exec -- bun ./infra/railway/node_modules/@railway/cli/bin/railway.js up --service relay --detach
# Wait for API, Web and Relay to become healthy before publishing Gateway.
mise exec -- bun ./infra/railway/node_modules/@railway/cli/bin/railway.js up --service gateway --detach
```

The workspace scripts select `infra/railway/railway.ts` explicitly with `--file`.
The scoped preload restores Railway's Node-style evaluator file argument when
Bun loses it. It only runs in the IaC child process; application builds and
production processes continue to use Bun. No Node installation or pin is needed.
Review plans for application changes and no unrelated service or volume deletion.
Upload from a clean checkout plus the reviewed deployment configuration.
CLI uploads remain available for explicit manual releases. Use GitHub-triggered
deployments for normal canary updates after connecting the repository.
Detached upload completion is not a health result: inspect deployment status and
logs, then verify HTTPS, /ready, SSR assets, login, secure cookies and Relay v4.

Railway and Compose share apps/api/Dockerfile and apps/web/Dockerfile. The default
API `deploy` stage extends the runtime stage with database production dependencies
and canonical migrations. Its shared `migration-payload` stage discovers the
database workspace's production dependency sources automatically through
`deploy/sources.ts`; Compose's migration image copies the same payload.
Compose selects runtime and the independent migrate
stage explicitly; Web defaults to runtime on both platforms.
Railway runs bun run --cwd packages/database migrate
in its isolated pre-deploy container. A failure blocks the new deployment.
API startup also checks pending migrations by default from private bundled SQL assets.
`DATABASE_MIGRATE_ON_START=false` skips the startup check when the pre-deploy hook
owns migration. Both paths share the same database advisory lock and migration ledger;
the switch does not disable the explicit pre-deploy command.
For future updates, back up the database first. If pending migrations require
transactional indexes or otherwise block writers, stop the existing API and Relay for an
agreed maintenance window before migration; ordinary rolling pre-deploy execution
does not stop the old API or Relay. Preserve migration history and storage on rollback.

The shared application Dockerfiles use manifest/dependency layer caching without
cache mounts. Railway requires literal service-specific cache mount IDs, so those
mounts would prevent portable files. Source-only changes reuse installed layers;
manifest or lockfile changes can require a fresh download. Compose retains its
bounded builder and reuses the same image layers. Its `deploy/build.sh` adds Bun/VP
cache mounts to temporary copies of these Dockerfiles and explicitly selects
`migrate`/`runtime`; it does not build the API's final `deploy` stage. The temporary
copies are removed on exit.
`bun run smoke:deployment` exercises both image profiles with an isolated temporary
database and Redis. This local gate does not apply IaC or contact Railway services.

## Bind raypx.com

The initial temporary origin is https://gateway-production-4d3f.up.railway.app.
After the domain is ready:

1. Add raypx.com to Gateway's public networking, targeting port 8080.
2. Apply the exact DNS records Railway provides and wait for its certificate.
3. Set Gateway's PUBLIC_ORIGIN to https://raypx.com.
4. Check the resolved API AUTH_URL, ALLOWED_ORIGINS and Web VITE_API_URL references.
5. Rebuild Web because VITE_API_URL is baked into browser and SSR output; redeploy
   API to refresh authentication settings. Keep the same database, Redis and AUTH_SECRET.
6. Repeat HTTPS, signed-out redirect, login, cookie and Relay checks on raypx.com.

The DNS change alone does not rebuild Web or change its API origin.
