# Environment

API and Worker require `DATABASE_URL`. API uses Better Auth with
`AUTH_SECRET` and `AUTH_URL`. External browser origins are listed in
`ALLOWED_ORIGINS`.

Redis is optional in development and required for production AI admission.
Only API uses these server-only variables:

```text
REDIS_URL                         optional Redis connection URL
CACHE_PREFIX                     key namespace, defaults to `voidmix`
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
Production starts without mail configuration so `/health`, login, and Admin
remain available. Registration, password-reset requests and verification-email
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

The example environment sets `VITE_API_URL=http://localhost:3002`; Web has no
implicit local API default. The standalone API defaults `AUTH_URL` to
`http://localhost:3002`. Set both public origins explicitly in production.
Web's Docker build requires `VITE_API_URL` as a build argument; setting it only
when the finished container starts does not configure the browser. See
[deployment](../architecture/deployment.md#containers-and-railway).
