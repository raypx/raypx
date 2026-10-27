# Administrator configuration

Web exposes `/admin/settings` to verified administrators. It uses the existing API
and PostgreSQL foundation on both Node and Cloudflare; there is no second admin
server or configuration package.

## First setup

1. Create the PostgreSQL database and configure `DATABASE_URL`, authentication,
   origins and the mail provider in the API environment.
2. Run `bun run db:migrate` against that database. This creates all foundation
   tables, including `system_configuration`; the migration does not create a database.
3. Set `ADMIN_EMAILS=owner@example.com` in the API runtime environment (comma-separated
   for multiple administrators), then deploy/restart the API. On Workers use a
   runtime variable, not a build variable. An empty list grants nobody access.
4. Register that account, verify its email and sign in to Web. Open **Site settings**
   in the sidebar. Membership is checked from the current server session on every
   admin request, including writes. No first-user takeover or client-supplied role exists.

Upgrading an existing deployment: run the migration before deploying this API.
Sign-up is fail-closed, so until `system_configuration` exists every registration
returns `CONFIGURATION_UNAVAILABLE` (503) and the Web sign-up page shows
unavailability. Existing sign-in keeps working.

Database creation and connection credentials remain deployment configuration.
Without the database, the page reports unavailability; it does not pretend a save
succeeded or fall back to browser-only persistence.

## Settings and precedence

| Setting            | Initial value | Effect                                                                  |
| ------------------ | ------------- | ----------------------------------------------------------------------- |
| Site name          | Raypx         | Web shell, sign-in pages and authentication mail; logo image retained   |
| Open registration  | On            | API accepts new email/password accounts; off preserves existing sign-in |
| Background cleanup | On            | Allows the next cleanup run, provided deployment `JOBS_ENABLED=true`    |

`JOBS_ENABLED` remains false by default and is the deployment kill switch. The
page can pause and resume cleanup without rebuilding once that gate is enabled.
It cannot override a disabled deployment. Retention, batch limits and the 15-minute
schedule remain the [server jobs](server-jobs.md) policy. A run already in progress
finishes using the choice it read at the start.

The singleton stores explicit non-secret columns, a revision, the last editor's
user ID and update timestamp. Defaults apply only when the migrated table has no
row. Missing tables or failed queries return a safe unavailable error.

The public projection, the sign-up pre-check and mail site names read through a
5-second [server cache](caching.md): Redis when configured, otherwise memory per Node
process or Worker isolate, so other replicas apply a change within that window.
Failed reads are never cached, and a save refreshes the cache it uses (every Node
process within a second with Redis, otherwise only the instance that handled it). Admin reads, saves, cleanup runs and the
Better Auth user-create hook always read the database. That hook is the
authoritative registration gate for every sign-in method, so a closed policy
cannot be bypassed by a stale cache or a future provider. Web refreshes the public
projection on navigation/focus; saving also invalidates it immediately for that
browser.

Every save includes its read revision. Concurrent first saves and later edits use
database compare-and-swap, returning a conflict instead of silently overwriting.
The page retains the draft until the administrator loads the latest version,
which keeps the fields they edited and takes every other field from the new
revision. Writes require a valid session, verified allowlisted email and an Origin
in `ALLOWED_ORIGINS`, and are limited to 10 per administrator per minute. DTOs
reject extra configuration keys.

The public projection contains only site name and registration availability.
Database URLs, secrets, administrator email lists and provider credentials never
enter these responses. The admin page only displays non-secret deployment flags
for cleanup and mail availability. To recover from a closed registration policy,
an existing verified administrator can sign in and re-enable it.

## Server-side injection (IoC)

The configuration module uses factory injection. Its ports live in
`apps/api/server/configuration/types.ts`; consumers do not import the PostgreSQL
adapter. No decorators, global service locator or extra container library is needed.

- `ConfigurationReader` exposes `read()` for business rules and jobs.
- `ConfigurationService` adds `readCached()` for public, latency-tolerant reads,
  administrator checks and validated `update()`.
- `ConfigurationRepository` is the storage port. Its update must atomically compare
  the expected revision and return `null` on conflict, including competing first saves.

Inject the smallest interface a consumer needs. For example, within the API app:

```ts
import type { ConfigurationReader } from "../configuration/types.js";

export function createRegistrationPolicy(configuration: ConfigurationReader) {
  return async () => (await configuration.read()).values.registrationEnabled;
}

// In the composition root, using the runtime already owned by this request/process:
const registrationAllowed = createRegistrationPolicy(runtime.configuration);
const allowed = await registrationAllowed();
```

The cleanup job is an actual reader consumer via `createCleanupJob`. HTTP and jobs
receive the same service within a runtime. Each `read()` goes back to storage rather
than capturing values at construction time. Pass `cache` in `RuntimeProviders` to
share `readCached()` across short-lived runtimes; the Cloudflare entry does this per
isolate.

Direct writes use the same validation, administrator policy, audit editor and revision
checks as the GUI. Resolve the session from the server's authentication adapter for
the current request; never construct it from client-provided identity or retain it
between requests. Expired or mismatched sessions are rejected as well.

```ts
const auth = await runtime.readSession(request.headers);
const current = await runtime.configuration.read();
const saved = await runtime.configuration.update(
  { values: { ...current.values, siteName: "My workspace" }, revision: current.revision },
  auth,
);
```

`ConfigurationError.code` reports `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_INPUT`,
`CONFIGURATION_CONFLICT` or `CONFIGURATION_UNAVAILABLE`. Callers must handle a
conflict explicitly; do not retry with a fresh revision and overwrite another editor.
Browser-origin checks remain the responsibility of the HTTP boundary.
`runtime.readSession(headers)` uses the same authentication adapter as HTTP and
resolves the session on every call. The runtime does not retain a user's session.

For a custom adapter or a test double, construct the service directly:

```ts
const configuration = createConfigurationService({
  repository,
  adminEmails: environment.ADMIN_EMAILS,
});
```

Platform entry points accept the same typed `RuntimeProviders` as an optional
second argument. For example, in a custom composition root:

```ts
// Node: own one runtime for the process and close it on shutdown.
const runtime = await createApiRuntime(environment, {
  createConfigurationRepository: (db) => repositoryFor(db),
});
```

```ts
// Cloudflare: create inside the request/event, then close in finally or waitUntil.
const runtime = await createCloudflareRuntime(bindings, {
  createConfigurationRepository: (db) => repositoryFor(db),
});
```

Alternatively, pass the factory in `createRuntime`'s resources when composing all
dependencies yourself. The default is PostgreSQL. The factory runs once per
runtime, receives its database connection and must not capture another runtime's
connection. Runtime close owns that connection; custom repositories should not
allocate independent resources without arranging their cleanup. Node keeps its
process runtime; Workers create a new one for each request or scheduled event and
close it afterward. Consumers must not retain a service past that lifecycle.

These interfaces are API-internal. Other apps use the typed RPC client rather than
importing another application's source.

## Verification

```sh
bun run --cwd apps/api test -- tests/integration/configuration.test.ts
bun run --cwd apps/api test -- tests/unit/configuration tests/integration/configuration-runtime.test.ts tests/integration/runtime-providers.test.ts tests/unit/jobs
bun run --cwd apps/web test -- tests/component/features/configuration.test.tsx
NODE_ENV=test TEST_DATABASE_URL=postgres://user:password@localhost/raypx_configuration_test bun run test postgres
bun run verify
```

The database gate requires an isolated `_test` database and an empty settings
table. It checks competing first saves, revision conflicts and persistence across
clients; it removes only its own fixture row afterward.
