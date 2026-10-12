# Runtime and Deployment

## Deployment units

```text
web       Bun 1.4.0 container
api       Bun 1.4.0 standalone API container
worker    Bun 1.4.0 Debian container; Pi and document converters
postgres  independent service
redis     production AI admission limiter
objects   private S3-compatible bucket
desktop   macOS and Windows installers
```

API is the primary HTTP deployment and includes Auth, Hono, and oRPC.
Web serves pages and SSR and calls the independent API origin.
Desktop consumes the API origin and is distributed through Electrobun native bundles.

## Local PostgreSQL

```bash
docker compose up -d postgres
bun run db:migrate
bun run db:studio
```

The API and Worker require `DATABASE_URL`; Web does not initialize a database.
Use a new database and the `packages/db/drizzle-cloud` baseline. The historical
`drizzle` directory is retained for reference and is not applied to the new host.
Do not point this release at the old business database.

`REDIS_URL` is optional for local development; production AI admission needs it.
When its limiter fails, new AI requests stop while historical reads and logout
remain available. Auth state and policy are always PostgreSQL-backed. If the
initial Redis connection fails, restart the API after Redis recovery to restore
admissions. API and Worker share account quotas and private object storage.

## Containers and Railway

Each deployable service owns its container and Railway configuration:

```text
apps/web/Dockerfile       apps/web/railway.toml
apps/api/Dockerfile       apps/api/railway.toml
apps/worker/Dockerfile    apps/worker/railway.toml
```

The Railway service root remains the monorepo root so the Docker build can read
workspace packages and `bun.lock`. Select the matching nested `railway.toml` as
the service config path. Each builder prunes that application with the pinned
Turbo version, freezes installation against the canonical Bun lockfile and
pruned workspace manifest, copies source before
shared postinstall, and invokes the root build gate. Only built production
artifacts enter the runtime image.

Web and API use pinned Bun 1.4.0 Alpine builder/runtime images. Worker keeps
Debian Bookworm and copies the pinned Bun executable into that converter image.
Invoke package binaries with `bun x --bun`; the separate `bunx` executable is
not copied into the Worker tools image.

- Web runs `bun .output/server/index.mjs` on Railway's `PORT` and exposes
  page routes plus `/health`.
- API starts through `bun apps/api/scripts/start.mjs` and exposes `/api/auth/*`,
  `/rpc/*`, and `/health` on its own origin. Nitro also forwards the private
  `/internal/execution/*` Gateway and development-only `/api/cloud/storage/*`
  routes to Hono; production storage continues to use private S3.
- Worker starts `bun .output/server/index.mjs`; Nitro packages the companion
  `.output/server/runner.mjs`, shared chunks and runtime package assets in the
  same artifact. Its durable PostgreSQL leases are
  independent from execution ownership. Deploy API and Worker against the same
  new database and object bucket.
- API requires production values for database, Auth, and allowed external
  origins. Mail can come from database settings or environment fallbacks;
  missing mail does not prevent startup. Web does not require database or Auth
  secrets; its builds require `VITE_API_URL` pointing at the public API origin.

Production API and Worker require `S3_BUCKET`; configure the same region,
endpoint and credentials or use the platform credential chain. The bucket must
be private. Configure bucket CORS for the exact Web origin and signed POST
uploads; preview/download URLs are short-lived and authorized by the API.
Development hosts can share `BLOB_STORAGE_DIR`, an absolute directory; the
default uses the operating system temporary directory.

Enable Search/Computer only after setting positive account model-call,
concurrency and storage limits, `CLOUD_MODEL_PROVIDER`, `CLOUD_MODEL_ID`,
`CLOUD_MODEL_API_KEY` and `BRAVE_SEARCH_API_KEY` on API only. Worker receives
`CLOUD_EXECUTION_GATEWAY_URL` for the API's private network origin. Keep the
`/internal/execution/*` path off public ingress when the deployment supports
private routing; durable RunGrants authenticate each request. Runner children
receive neither provider nor database/object-store credentials. Set `CLOUD_WEB_URL` for
notification links. Search, Computer, delegation and export flags are fixed
typed server configuration. Changing a flag stops new admissions; cancel a
running task with its separate command.

Worker's image includes pinned LibreOffice, Poppler and Chinese fonts. `SOFFICE_BINARY`
and `CLOUD_PDF_FONT_PATH` can override their paths outside the image. A successful
PPTX write is insufficient: publish only after its PDF preview converts.
`PDFTOTEXT_BINARY` and `PDFINFO_BINARY` select the trusted text/page parsers;
image-only PDFs report that OCR is unavailable.
`bun --no-env-file --no-install apps/worker/.output/server/index.mjs --check` validates the packaged runtime without
database or provider credentials. Real converter tests need LibreOffice.
The image's `--check-documents` probe generates and verifies Chinese reports,
tables and an eight-page deck using the actual installed converters.

Optional `SENTRY_DSN` is server-only. `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY` and
`VITE_POSTHOG_HOST` are Web build-time public values. The Web Dockerfile also
declares these optional public build arguments, plus `VITE_SITE_URL` and
`VITE_SUPPORT_EMAIL`; set them before building the image. Product events are explicit;
automatic capture and session recording remain disabled. Do not include prompt,
file content or signed URLs in telemetry.

`VITE_POSTHOG_KEY` must be the public PostHog project token, never a personal or
project secret API key. Docker's `SecretsUsedInArgOrEnv` check can flag its name;
that warning does not mean pruning failed or that this browser value is secret.
Actual server secrets must remain runtime-only or use build secret mounts when
needed during a build.

Set `VITE_API_URL` on the Railway **Web** service before building (for the hosted
Raypx deployment, `https://api.raypx.com`). The Dockerfile declares this
public build argument so Railway makes it available to Vite. Missing or empty
values stop the image build instead of shipping a browser that requests
`/rpc/*` and `/api/auth/*` from the Web host and receives 404 responses. For a
manual Docker build, pass the same argument:

```bash
docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.example.com -t raypx-web .
```

Changing a runtime variable on an existing Web image is insufficient: rebuild
and redeploy Web after changing its API origin. API's `ALLOWED_ORIGINS` must
include the exact Web origin (scheme and hostname, no trailing slash), and
`AUTH_URL` must point to the public API origin. Keep any other permitted origins
when updating the comma-separated allowlist. For sibling production domains,
set API's `AUTH_DOMAIN` to their common cookie domain (for example,
`raypx.com`), so Web SSR receives the same session cookie as the API.

To diagnose a protected-page failure, inspect the failing request URL first.
`https://raypx.com/rpc/account/get` returning plain 404 means the Web bundle
has no API origin. The same read on `https://api.raypx.com` should return a
structured `UNAUTHORIZED` response without a session; it must also include
`Access-Control-Allow-Origin: https://raypx.com` and
`Access-Control-Allow-Credentials: true` for requests from Web. A healthy
`/health` alone does not verify RPC routing or browser CORS.

Production startup does not use the private `rpx` CLI. Railway and other
platforms inject values through `process.env`; a `/app/.env` file is optional,
not required. The container entrypoints load that file only when it exists, so
missing optional files do not produce startup warnings. `.dockerignore`
excludes local `.env` and `.env.local` files from image build contexts.

Remaining `VITE_*` logging values are compiled into browser bundles. A runtime
`/app/.env` mount cannot change them. Auth and product transport use the configured
API origin with credentialed cookies.

The shared API environment schema requires `DATABASE_URL` during startup. The
in-memory repository remains available only to direct `createApiApp` tests that
inject it explicitly; it is not a runtime fallback.

Web and API hosts explicitly select Nitro's `bun` preset and emit complete Bun
server artifacts. Runtime stages copy generated artifacts with `bun:bun`
ownership before switching to the unprivileged `bun` user.
The Web image contains only the application package manifest and `.output`; it
does not run a second filtered workspace install or copy repository
`node_modules`. Its container sets `NITRO_HOST=0.0.0.0`, reads Railway's
injected `PORT`, and declares the Bun start command in `railway.toml`.
Production entrypoints disable automatic package installation and load only
explicit runtime environment values or the optional `/app/.env` file.

## Runtime policy

Bun 1.4.0 is the package manager, repository JavaScript runtime and production
runtime for Web, API, Worker and isolated Runner processes. JavaScript tools use
explicit `bun --bun` commands to override package executable shebangs. Supported
Node-compatible APIs, `@types/node` and TypeScript resolution presets remain
available through Bun; they do not add a Node executable requirement.
Worker uses
Nitro's Bun preset with a custom durable-host entry; both the host and isolated
Runner use the same Bun executable. Its complete `.output` directory is the
deployment artifact; fixed document converters and fonts remain image-owned.
See [ADR-0023](decisions/0023-worker-vite-nitro-artifact.md) for the Worker build
and cache boundary, and [ADR-0024](decisions/0024-bun-runtime.md) for the repository
runtime decision. Runtime compatibility, authentication, isolated-process and
relocated-artifact checks remain required gates when the runtime pin changes.

## Desktop lifecycle

Electrobun's narrow TypeScript main process owns the tray and window lifecycle.
TanStack Start builds a static SPA shell at `dist/client/index.html`; the
build-time `dist/server` output only prerenders that shell and is not included
in the installer. The renderer is a cloud-backed client with no RSC, server
function, or server-route runtime. The first version has no separate background
daemon and no offline synchronization engine. Navigation contains Projects and
Settings; Web owns cloud AI conversations and delivery review. Root `desktop:build`
checks/builds the renderer through Turbo, then packages the pinned Bun 1.4.0
Electrobun host. The persistent WebView uses hash history for static assets;
[ADR-0020](./decisions/0020-electrobun-desktop-host.md) defines its native boundary.
macOS uses system WebKit; Windows ships CEF with browser security enabled. Native
API deployment must explicitly allow `views://main` and use HTTPS with the
existing production `SameSite=None; Secure` cookies. A loopback HTTP renderer test
does not establish packaged `views://` authentication or third-party cookie support. The former local execution
protocol is retired under [ADR-0019](./decisions/0019-retire-legacy-desktop-execution.md),
without deleting user-local journals, sessions or files.
