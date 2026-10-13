# Environment

## Validation ownership

Reusable environment validation lives in the independently released
[`@raypx/env`](https://github.com/raypx/packages/tree/main/packages/env) library.
Raypx consumes npm `0.0.6` through the default Bun catalog, with Zod supplied as
a peer. This continues the existing package's version history.

Keep product imports on `@raypx/shared/env` and `@raypx/shared/env/runtime`.
These compatibility subpaths directly re-export the library and its `NODE_ENV`
preset; they contain no duplicate validation or type implementation. The same
functions, Zod runtime and `EnvError` class are used through either boundary.
Applications, adapters and Logger keep ownership of their own presets.
[ADR-0032](../architecture/decisions/0032-independent-env-library.md) records the
ownership and packaging boundary.

`createEnv` composes typed presets and reads caller-supplied values or the
runtime's process/Vite environment. `defineEnv` also supports an explicit public
prefix. Empty strings normalize to `undefined`, defaults are validated, and
browser access rejects undeclared and server-only variables. The shared runtime
preset supports `development`, `production` and `test`.

Library builds preserve `import.meta.env`; the consuming Vite build supplies
public values, mode and SSR state. Web and Desktop continue calling
`createEnv` with their existing presets, without manually copying Vite values.
Shared keeps the library external to preserve this behavior and export identity.
Packaged consumer checks cover both explicit runtime values and browser defaults
in an actual Vite build.

The library never loads `.env` files. The private `rpx env -- <command>` runner
still uses Dotenvx to load repository files into a copied child environment and
forward termination signals. It is not part of the public Env package.

## Product configuration

API and Worker require `DATABASE_URL`. API uses Better Auth with
`AUTH_SECRET` and `AUTH_URL`. External browser origins are listed in
`ALLOWED_ORIGINS`.

The Raypx rename retains existing data. PostgreSQL migration history is unchanged;
run `bun run db:migrate` to update the default issuer for new auth accounts.
Both the current and former development `AUTH_SECRET` defaults are rejected in
production. Existing production secrets and Better Auth cookie names remain valid.
Within the same browser profile, Desktop theme and localStorage locale settings
migrate from the old keys only when the new Raypx keys are absent. The native bundle identifier and WebView
partition are now `com.raypx.desktop` and `persist:raypx`; an existing native
installation requires signing in again because its previous WebView profile is separate.

Without an explicit `BLOB_STORAGE_DIR`, development API and Worker write cloud
objects to the temporary `raypx-cloud-objects` directory and read existing objects
from `voidmix-cloud-objects` as a fallback. The API's local project blobs likewise
write to `.raypx/blobs` and read `.voidmix/blobs`; deletion removes both copies.
An explicit storage directory keeps its existing path and production S3 settings
are unaffected. The duplicate Worker identity advisory lock keeps its previous
namespace so old and new processes remain mutually exclusive during deployment.
The default Redis prefix is now `raypx`, so limiter counters start a new window
unless deployment explicitly preserves `CACHE_PREFIX`.

Redis is optional in development and required for production AI admission.
Only API uses these server-only variables:

```text
REDIS_URL                         optional Redis connection URL
CACHE_PREFIX                     key namespace, defaults to `raypx`
CACHE_REDIS_CONNECT_TIMEOUT_MS   connection timeout, defaults to `10000`
CACHE_REDIS_OPERATION_TIMEOUT_MS command timeout, defaults to `5000`
CACHE_REDIS_MAX_RETRIES_PER_REQUEST defaults to `1`
```

Sessions, verification, revocation and Auth policy always use PostgreSQL.
Better Auth has no Redis secondary storage. When `REDIS_URL` is configured, API
checks it at startup; an initial failure keeps historical reads available and
requires an API restart after Redis recovery. New production AI requests fail
closed whenever the atomic Redis limiter is unavailable. An already connected
Redis client can reconnect after transient command failures. There is no
in-memory replacement for the AI limiter.

The generic cache serializes values with `JSON.stringify` and restores them with
`JSON.parse`. Plain objects, arrays, strings, numbers, booleans, and `null` round
trip; the TypeScript generic is not runtime schema information, so `Date`, class
instances, `Map`, `Set`, `BigInt`, and custom prototypes are not automatically
revived. Auth policy bypasses this cache and retains its native `Date` values.

Mail environment variables are server-only compatibility fallbacks:

```text
RESEND_API_KEY   production Resend credential
MAIL_FROM        verified production sender address
MAIL_FROM_NAME   sender display name
EMAIL_TEMPLATES_BASE_URL optional application URL used by welcome mail
MAIL_DEFAULT_LOCALE fallback locale when the recipient's is unknown (`en` or `zh`, defaults to `en`)
```

Runtime precedence is database `system_settings` / `system_secrets`, then the
variables above, then package defaults. The API resolves that state before each
delivery. The retired settings administration UI/API is not available in the
cloud release; configure initial deployment fallbacks through these variables.
Typed settings repositories retain independent `database`, `environment`,
`default`, or `missing` sources without exposing credentials to clients.

Development and test may omit the Resend key and sender address; the mail
package then uses its logger transport and never makes a network request.
Production starts without mail configuration so `/health` and login remain
available. Registration, password-reset requests and verification-email
resends return HTTP 503 with
`MAIL_NOT_CONFIGURED` until mail is ready. A failed welcome email after a
successful verification is logged as a non-critical, redacted side effect.

`mail.resend_api_key` is currently stored as plaintext in `system_secrets`.
Runtime settings resolution exposes only readiness to clients and never returns
the key or places it in logs or audit metadata. Database readers can still see
the key, which is an accepted
first-version production risk.

Authentication policy has no environment-variable fallback. When its fixed
`system_settings` keys are absent, registration is open, every email domain is
allowed, and verification, password-reset, and welcome email behavior is
enabled. Relevant requests read the latest database values without a restart;
the retired Auth settings administration routes are not part of this release.

Unauthenticated pages use `public.auth.capabilities.get`, which returns only
registration, verification-email-request, and password-reset-request
availability booleans calculated from the current Auth policy and mail
readiness. It never exposes the email-domain allowlist, sources, missing fields,
or secret state. Browser failures fail open for navigation only; the server
still enforces every policy.

Browser code may read only explicitly declared public values from `apps/web/src/env.ts`.
Database, Auth, mail, and server logger values remain API-side and never enter
the browser module graph. Web and Desktop use the explicit `VITE_API_URL` API
origin for Better Auth and authenticated requests. Auth cookies are HTTP-only
and requests include credentials.

Packaged Electrobun views use the exact `views://main` origin. Include that origin
in the API's `ALLOWED_ORIGINS`; do not trust opaque `null` origins. Packaged account
requests require the production HTTPS API and its `SameSite=None; Secure` cookies.
Loopback HTTP preview tests use the development cookie policy and do not establish
that production WebView behavior.

The example environment sets `VITE_API_URL=http://localhost:3002`; Web has no
implicit local API default. The standalone API defaults `AUTH_URL` to
`http://localhost:3002`. Set both public origins explicitly in production.
Web's Docker build requires `VITE_API_URL` as a build argument; setting it only
when the finished container starts does not configure the browser. See
[deployment](../architecture/deployment.md#containers-and-railway).
