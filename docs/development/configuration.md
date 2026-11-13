# Configuration center

Web exposes `/admin/settings` to verified administrators. It uses the existing API
and PostgreSQL foundation on Bun; there is no second admin
server or configuration package.

## First setup

1. Create the PostgreSQL database and configure `DATABASE_URL`, authentication,
   and origins in the API environment.
2. Provide the Resend settings below and run `bun run db:migrate --import-config`
   against that database. The command creates the foundation tables and seeds
   missing provider settings. The target database must already exist.
3. Register the intended administrator accounts and verify their emails.
4. Set explicit `DATABASE_URL` and `ADMIN_EMAILS=owner@example.com` (comma-separated
   for multiple accounts), then run `bun run --cwd apps/api auth:bootstrap-admins`.
   This is an operator command, never a startup action. Database roles remain
   authoritative after it finishes; removing a role is not undone by the email list.
5. Sign in to Web and open **Configuration center**. Membership is checked from the current
   stored role on every admin request, including writes. There is no first-user takeover.

Upgrading an existing deployment: run the migration before deploying this API.
Sign-up is fail-closed, so until `system_configuration` exists every registration
returns `CONFIGURATION_UNAVAILABLE` (503) and the Web sign-up page shows
unavailability. Existing sign-in keeps working.

Database creation and connection credentials remain deployment configuration.
Without the database, the page reports unavailability; it does not pretend a save
succeeded or fall back to browser-only persistence.

## Settings and precedence

The **Site** tab manages the settings below. The **Object storage** tab manages
attachment upload availability, the S3 location and write-only credentials.
The **Email** tab manages Resend. Each tab has its own revision and saves
independently. Provider changes record only the enabled state in the audit.
See [S3 configuration](object-storage.md).

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

The public projection, signup pre-check and mail site names use the
[configuration reader](caching.md#runtime-configuration) with a five-second
process-local TTL. A committed save clears local state and notifies other
replicas over Redis. Admin reads, saves, cleanup runs and the Better Auth
user-create hook always read the database. That hook is the
authoritative registration gate for every sign-in method, so a closed policy
cannot be bypassed by a stale cache or a future provider. Web refreshes the public
projection on navigation/focus; saving also invalidates it immediately for that
browser.

Every save includes its read revision. Concurrent first saves and later edits use
database compare-and-swap, returning a conflict instead of silently overwriting.
The page retains the draft until the administrator loads the latest version,
which keeps the fields they edited and takes every other field from the new
revision. Writes require a valid session, verified administrator role and an Origin
in `ALLOWED_ORIGINS`, and are limited to 10 per administrator per minute. DTOs
reject extra configuration keys.

The public projection contains only site name and registration availability.
Database URLs, encryption secrets, administrator email lists and stored provider
credentials never enter API responses. The Site tab displays deployment
availability for cleanup. To recover from a closed registration policy,
an existing verified administrator can sign in and re-enable it.

## Resend email

In **Configuration center → Email**, enter a sender from a domain verified in
Resend, a sending API key and the default template language. The account
request's language takes precedence when available. Save to enable registration
verification and password-reset emails. Pausing delivery preserves the key.
Leave the key field blank when updating the other settings. A replacement is
encrypted with the deployment's `AUTH_SECRET`; the key is never returned.
Saves immediately clear the current process's Resend client. Redis notifies other
API replicas to reload on their next mail request. A five-second process-local
TTL covers missed notifications and deployments without Redis. Saving does not
send a test email or verify the key with Resend.

For a new deployment without a verified administrator, or when upgrading from
environment-based mail delivery, run the following from the repository with
the target `DATABASE_URL`, `AUTH_SECRET`,
`RESEND_API_KEY` and `MAIL_FROM` supplied securely to the command's environment.
`MAIL_DEFAULT_LOCALE` is optional and defaults to `en`.

```sh
bun run db:migrate --import-config
```

Schema migrations and the requested imports commit in one PostgreSQL transaction.
The import initializes missing Resend and S3 rows and preserves existing settings.
Use the configuration center for later changes. After seeding the row, remove the
three import-only mail variables. Keep the same deployment secret
across replicas. With delivery paused or unconfigured, mail actions return
`MAIL_NOT_CONFIGURED`; existing verified users can still sign in.

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

The cleanup job receives the site reader via `createCleanupJob`. API composition
registers the site snapshot, S3 provider and Resend client with one
`createConfigurationReads` per runtime. For a new configuration scope, register
its typed PostgreSQL loader in `source()`, use `read()` where policy requires
fresh values, and call `committed(scope, revision)` after the settings and audit
transaction commits. API and Web contracts keep their existing typed projections.

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
  access: createAccessPolicy(),
});
```

Platform entry points accept the same typed `RuntimeProviders` as an optional
second argument. For example, in a custom composition root:

```ts
// Bun: own one runtime for the process and close it on shutdown.
const runtime = await createApiRuntime(environment, {
  createConfigurationRepository: (db, audit) => repositoryFor(db, audit),
});
```

Alternatively, pass the factory in `createRuntime`'s resources when composing all
dependencies yourself. The default is PostgreSQL. The factory runs once per
runtime, receives its database connection and must not capture another runtime's
connection. Runtime close owns that connection; custom repositories should not
allocate independent resources without arranging their cleanup. Bun keeps its
process runtime, closed on shutdown. Consumers must not retain a service past that lifecycle.

These interfaces are API-internal. Other apps use the typed RPC client rather than
importing another application's source.

## Verification

```sh
bun run --cwd apps/api test -- tests/integration/configuration.test.ts
bun run --cwd apps/api test -- server/configuration tests/integration/configuration-runtime.test.ts tests/integration/runtime-providers.test.ts server/jobs
bun run --cwd apps/web test -- src/features/configuration.component.test.tsx
NODE_ENV=test TEST_DATABASE_URL=postgres://user:password@localhost/raypx_configuration_test bun run test postgres
bun run verify
```

The database gate requires an isolated `_test` database and an empty settings
table. It checks competing first saves, revision conflicts and persistence across
clients; it removes only its own fixture row afterward.

Administrative writes also require the durable audit store introduced with the
console. The default runtime couples configuration CAS and success history in one
transaction; custom repository factories receive AuditService and must keep this
contract. See [administration audit](accounts.md#durable-audit) for migration,
uncertainty and permanent-retention behavior.
