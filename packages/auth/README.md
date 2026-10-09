# @raypx/auth

Server-only Better Auth integration with a SQLite Drizzle adapter. The package
exports `auth`, `getSession(request)`, and `requireAuth(request)`, plus session
and user types. It is not mounted in the web application's routes.

`auth` is initialized during module import and calls `getDatabase()`. Importing
this package therefore opens SQLite; it is not a lazy provider factory. Web
runtime initialization and readiness probes do not import it or activate its
provider dependencies.

The current instance enables email/password authentication, disables required
email verification, and enables a one-hour session cookie cache.
`getSession(request)` reads the Better Auth session from request headers.
`requireAuth(request)` returns that session or a JSON response with HTTP 401.
Better Auth failures are sent to the shared server logger.

```typescript
import { requireAuth } from "@raypx/auth";

const session = await requireAuth(request);
if (session instanceof Response) return session;
const userId = session.user.id;
```

This is a helper example for an intentionally enabled authentication feature,
not an existing web endpoint. The package does not provide application auth
routes, a browser auth hook, OAuth provider configuration, email delivery,
authentication table schemas, or migration configuration. It does not
automatically create those tables. `SESSION_SECRET` and `COOKIE_DOMAIN` are not
wired by this implementation or included in the supported application env
schema.

Before exposing authentication, add its table schemas and migrations, mount
its handler, and define and validate the configuration consumed by that
feature. Register the created database resource and its cleanup in the web
composition layer; do not initialize authentication solely for a readiness
probe. Preserve server-only import boundaries and validate external inputs.

The package compiles to ESM and TypeScript declarations with `@raypx/config`
engineering tasks and presets.
