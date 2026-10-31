# Railway deployment

The Railway project is [raypx](https://railway.com/project/766ffb45-d60f-4e4d-83b1-135443ff0b51),
environment production, in Singapore. Its data and authentication secret are independent
of the Dokploy Beta and Production projects.

## Services and configuration

The named IaC partial in [.railway/railway.ts](../../.railway/railway.ts) manages
api, web and gateway. Existing Postgres and Redis services and their volumes
remain outside this partial. Both were inspected and empty before the initial
foundation migration. Keep their images and persistent storage intact.

Gateway uses the pinned Caddy image and [Caddyfile](../../deploy/railway/Caddyfile).
Railway terminates public HTTPS on port 8080. Gateway routes `/api/*`, `/rpc/*`,
/relay, /health and /ready to API; other paths go to Web. Caddy proxies WebSocket
upgrades; API and Web have no public domains, and database connections use private
references. Access logging is
disabled and the error log removes request details.

API and Web bind to :: for Railway private networking. API has exactly one
replica because Relay ownership is process-local. All three application services
stay awake. Forwarded client IP headers remain untrusted until explicit, verified
proxy CIDRs are configured; the API uses its socket peer by default.

Runtime variables are deliberately unmanaged by IaC. This preserves secrets and
operator settings on Railway. Configure references in the dashboard or with
railway variable set --skip-deploys; never commit decrypted variables.

| Service  | Variables                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gateway  | PORT=8080; PUBLIC_ORIGIN is the current HTTPS origin; API_UPSTREAM=${{api.RAILWAY_PRIVATE_DOMAIN}}:3002; WEB_UPSTREAM=${{web.RAILWAY_PRIVATE_DOMAIN}}:3000                                         |
| api      | NODE_ENV=production; HOST=::; PORT=3002; NITRO_PORT=3002; DATABASE_URL=${{Postgres.DATABASE_URL}}; REDIS_URL=${{Redis.REDIS_URL}}; AUTH_SECRET is a private random value of at least 32 characters |
| api      | AUTH_URL=${{gateway.PUBLIC_ORIGIN}}; ALLOWED_ORIGINS includes that origin, https://raypx.com, views://main and raypx://; JOBS_ENABLED=true                                                         |
| web      | NODE_ENV=production; HOST=::; PORT=3000; NITRO_PORT=3000; VITE_API_URL=${{gateway.PUBLIC_ORIGIN}}                                                                                                  |
| api, web | VITE_APP_RELEASE optionally overrides the build release; otherwise the Docker build uses Railway's RAILWAY_GIT_COMMIT_SHA                                                                          |

Optional mail, administrator, storage and analytics settings remain explicit
per-environment settings. Without RESEND_API_KEY and a verified MAIL_FROM, mail
actions retain the MAIL_NOT_CONFIGURED guard. Never bypass verification for real users.
Both Dockerfiles declare `RAILWAY_GIT_COMMIT_SHA` as a build argument. Manual builds
outside Git must supply it or `VITE_APP_RELEASE`; no unversioned production fallback
is generated. Client assets record the resolved version for later SourceMap upload.
Service ports and health paths come from `@raypx/tooling/build/deployment`; repository
policy checks Caddy and Compose against the same ingress contract.

## Apply and deploy

API, Web and Gateway use the raypx/raypx GitHub repository's canary branch.
Matching pushes trigger automatic deployments using the shared
`apps/api/Dockerfile` and `apps/web/Dockerfile` and each service's watch patterns.
Shared package or manifest changes rebuild API and Web;
Gateway watches its proxy configuration and the IaC file.
Infrastructure changes still require config plan/apply: Railway does not apply
the IaC authoring file simply because it was pushed.

API and Web require `apps/api/Dockerfile` and `apps/web/Dockerfile`; the former
`deploy/railway/{api,web}/Dockerfile` paths are no longer provided.

For that configuration cutover, pause API/Web GitHub autodeploys, review
`config plan`, then apply the new paths and watch patterns. Keep any
`RAILWAY_DOCKERFILE_PATH` variable aligned with the same shared path. Deploy the
latest commit for API, wait for readiness, then deploy Web and verify it before
re-enabling autodeploys. Pushing the IaC file alone does not update live settings.

Install the repository dependencies with the pinned Bun. CLI 5.71.0 and SDK 3.16.0
were used for the initial deployment. Railway's legacy railway.toml configuration
has been replaced by its [current IaC interface](https://docs.railway.com/infrastructure-as-code).

Run these commands from the repository root:

```sh
mise exec -- bunx --bun @railway/cli@5.71.0 link --project 766ffb45-d60f-4e4d-83b1-135443ff0b51 --environment production
BUN_OPTIONS=--preload=./deploy/railway/iac-preload.ts mise exec -- bunx --bun @railway/cli@5.71.0 config plan
BUN_OPTIONS=--preload=./deploy/railway/iac-preload.ts mise exec -- bunx --bun @railway/cli@5.71.0 config apply --yes
mise exec -- bunx --bun @railway/cli@5.71.0 up --service api --detach
mise exec -- bunx --bun @railway/cli@5.71.0 up --service web --detach
# Wait for API and Web to become healthy before publishing Gateway.
mise exec -- bunx --bun @railway/cli@5.71.0 up --service gateway --detach
```

The scoped preload restores Railway's Node-style evaluator file argument when
bunx loses it. It only runs in the IaC child process; application builds and
production processes continue to use Bun. No Node installation or pin is needed.
Review plans for application changes and no unrelated service or volume deletion.
Upload from a clean checkout plus the reviewed deployment configuration.
CLI uploads remain available for explicit manual releases. Use GitHub-triggered
deployments for normal canary updates after connecting the repository.
Detached upload completion is not a health result: inspect deployment status and
logs, then verify HTTPS, /ready, SSR assets, login, secure cookies and Relay v4.

The shared API Dockerfile's final `railway` stage carries the database's production dependencies and
canonical migrations. Railway runs bun run --cwd packages/database migrate
in its isolated pre-deploy container. A failure blocks the new deployment.
For future updates, back up the database first. If pending migrations require
transactional indexes or otherwise block writers, stop the existing API for an
agreed maintenance window before migration; ordinary rolling pre-deploy execution
does not stop the old API. Preserve migration history and storage on rollback.

API and Web each have one Dockerfile for both deployment platforms. The shared
files omit cache mounts because Railway requires literal service IDs in mount
IDs and does not support variables there. Their manifest/dependency layers still
cache installs. Compose's `deploy/build.sh` adds Bun/VP cache mounts to a temporary
copy of these same files and explicitly selects `migrate`/`runtime`; it does not
build the API's final Railway stage. The temporary copies are removed on exit.
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
