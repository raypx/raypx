# @raypx/auth

Server-only Better Auth email/password authentication backed by SQLite. Importing
this package creates no instance, opens no database, and reads no environment
configuration. The application explicitly supplies its migrated database,
secret, and origin.

```typescript
import { createDatabase } from "@raypx/db";
import { createAuth, getSession, requireAuth } from "@raypx/auth";

// Run the database migration CLI before application startup.
const connection = createDatabase("./data/raypx.db");
const auth = createAuth({
  database: connection.db,
  secret: configuration.secret,
  baseURL: "https://example.com",
  environment: "production",
});

// Mount auth.handler(request) under /api/auth/*.
const session = await getSession(request, auth);
const required = await requireAuth(request, auth);
if (required instanceof Response) return required;
const userId = required.user.id;
// The application registers connection.close() for shutdown.
```

`CreateAuthOptions` requires `database`, `secret` (at least 32 characters), and
`baseURL` (an exact HTTP(S) origin). `environment` defaults to `development`;
production requires HTTPS and enables secure cookies. Optional `trustedOrigins`
accepts additional exact origins. Secrets must be randomly generated and supplied
by the application's validated configuration. Configuration errors never include
supplied values.

The supplied secret also overrides Better Auth's environment-based rotation
configuration. A before hook enforces the explicit origin allowlist for
`callbackURL`, `errorCallbackURL`, `newUserCallbackURL`, and `redirectTo` in parsed
body/query values and request query parameters. Root-relative paths such as
`/dashboard` are allowed; protocol-relative URLs and unsafe protocols are
rejected. The hook covers HTTP handlers and direct `auth.api` calls, so Better
Auth's implicit `BETTER_AUTH_TRUSTED_ORIGINS` merge cannot widen these redirects.
The HTTP handler prechecks the same fields before the library's global origin
middleware, which expects scalar values. Duplicate redirect query parameters and
non-string values receive the same fixed HTTP 403 response without echoing input.

The factory uses the `user`, `session`, `account`, and `verification` schema from
`@raypx/db/schema`. It enables email/password registration, login, and logout;
email verification is not required. It does not configure OAuth or email
delivery. Better Auth validates endpoint inputs and hashes credentials before
storing them. Origin and CSRF checks are explicitly enabled in every environment.
Internal library logs and telemetry are disabled; API errors send only their
error name to the shared logger.

Forwarded IP headers are ignored. Better Auth's IP-based rate limiter is disabled
because a Fetch Request does not provide a trustworthy socket identity. The
application's route layer must apply rate limiting using identity supplied by a
trusted transport, or use a shared anonymous bucket. Supplying an arbitrary
`x-forwarded-for` header does not establish a trusted identity.

Sessions live in SQLite. Cookie caching is disabled so deleting, expiring, or
revoking a session immediately invalidates its cookie. `getSession(request,
auth)` returns the active session or `null`; `requireAuth(request, auth)` returns
that session or a contract-compatible HTTP 401 JSON response. A valid request ID
is included in the unauthorized response. Exported `AuthInstance` and
`AuthSession` types are inferred from the factory.

Existing request-only helpers can migrate by calling `configureAuth(instance)`
once during application composition. `getAuth()` and the deprecated exported
`auth` facade forward to that explicit instance. Calls before configuration fail
with an actionable error and never initialize SQLite. `configureAuth(undefined)`
clears the default without closing the application-owned connection. Prefer
passing an instance directly when testing or serving separate applications.

Better Auth 1.6.1's Drizzle transaction callbacks are asynchronous, while
both SQLite drivers' transactions are synchronous. The adapter therefore keeps its
transaction option disabled; do not assume multiple auth writes form a single
SQLite transaction. Application-owned synchronous writes can use
`withTransaction` from `@raypx/db`.

The web composition layer owns feature activation, route mounting, readiness,
and connection disposal. Enable authentication only after applying the checked-in
migrations. The package factory never runs migrations or activates resources for
a probe. Build and strict type checking use `@raypx/config`; actual SQLite tests
cover registration, hashed credentials, login/logout, expiry/revocation, origin
checks, independent instances, and compatibility helper configuration. A Bun
subprocess verifies the same registration/login/logout flow using native SQLite.
