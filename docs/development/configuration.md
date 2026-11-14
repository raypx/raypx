# Configuration center

Web exposes `/admin/settings` to admitted deployment administrators. It uses the existing API
and PostgreSQL foundation on Bun; there is no second admin
server or configuration package.

## First setup

1. Create a fresh isolated PostgreSQL database. Set `DATABASE_URL`, `AUTH_URL`,
   exact `ALLOWED_ORIGINS`, and independent `AUTH_SECRET` and `APP_KEY` values.
   Apply the single current baseline with `bun run --cwd apps/api db:migrate`
   (or let the documented startup migration apply it). Never apply this baseline
   to an earlier/operator database.
2. Before public exposure, set optional API-only `SETUP_TOKEN` to a private random
   value of 32–512 printable ASCII characters. For example, generate one locally
   with `openssl rand -hex 32` and put it directly in the deployment secret store.
   Never use a `VITE_*` variable, build argument, URL or log for this value.
3. Open `/signup`. The first account becomes deployment administrator. If a token
   is configured, enter it in the masked setup field. Without mail, this account
   is immediately signed in and remains **unverified**. The setup screen opens
   the Email tab and offers **Skip for now**.
4. Configure the sender, write-only delivery key and language, save, then use
   **Send test email**. It sends only to the current administrator's account email.
   An accepted send is not proof of inbox delivery; check the inbox.
5. Review **Site → Open sign-ups**. It is on by default. Turn it off for
   invitation-only registration. Owners share existing copied Space invitation links.

`SETUP_TOKEN` is checked with a constant-time digest comparison only while bootstrap
is open. Five bootstrap email-signup attempts per client address per minute are
counted atomically in PostgreSQL, including missing/wrong tokens; the ordinary
production signup limit also applies. The edge must overwrite the configured
client-IP header and trust only declared proxies. With no token, production API
startup warns that the first visitor to sign up becomes administrator; signup
shows the same fact. Claim the account before exposing an unprotected deployment.

The `account_bootstrap` lifetime row and first user are committed in one locked
PostgreSQL transaction. Every supported account-creation path uses that adapter.
Once any account has been created, deleting all accounts does **not** reopen
bootstrap. There is no bootstrap-reset command. Do not delete that marker.
The existing explicit `auth:bootstrap-admins` operator command promotes existing,
verified accounts only; it does not reopen setup or create accounts.

Without mail, all email verification is skipped. New accounts persist
`email_verified=false` and `email_verification_skipped=true`. After mail is enabled,
new signups require verification; earlier no-mail accounts remain usable and see a
dismissible verification reminder in Web and native Mobile Account. Mail policy is
read freshly for each auth request and at account creation, including across API
replicas without Redis. Delivery paused counts as unconfigured. A failed
configuration/database read fails closed; it is not a no-mail policy choice.

Open unverified signup permits email squatting, impersonation by display name and
registration abuse. It does not prove ownership of an email address. Use invitation-only
registration for private deployments, verify recipient identity before sharing bearer
links or reset links, and configure mail before opening a public service.
Deployment administrator status never grants Space membership or content access.

Database/origin/encryption settings remain operator-owned. Storage and configuration
failures show unavailable states; clients never invent a successful save.

## Settings and precedence

The **Site** tab manages the settings below. The **Object storage** tab manages
attachment upload availability, the S3 location and write-only credentials.
The **Email** tab manages Resend. Each tab has its own revision and saves
independently. Provider changes record only the enabled state in the audit.
See [S3 configuration](object-storage.md).

| Setting            | Initial value | Effect                                                                |
| ------------------ | ------------- | --------------------------------------------------------------------- |
| Site name          | Raypx         | Web shell, sign-in pages and authentication mail; logo image retained |
| Open sign-ups      | On            | Anyone may register; off requires a valid Space invitation link       |
| Background cleanup | On            | Allows the next cleanup run, provided deployment `JOBS_ENABLED=true`  |

`JOBS_ENABLED` remains false by default and gates Nitro maintenance/
account jobs. It does not disable durable Run recovery or Space routine worker scans. The
page can pause and resume cleanup without rebuilding once that gate is enabled.
It cannot override a disabled deployment. Retention, batch limits and the 15-minute
schedule remain the [server jobs](server-jobs.md) policy. A run already in progress
finishes using the choice it read at the start.

The singleton stores explicit non-secret columns, a revision, the last editor's
user ID and update timestamp. Defaults apply only when the migrated table has no
row. Missing tables or failed queries return a safe unavailable error.

Public site decoration uses the short-lived configuration reader. Registration
admission reads the current sign-up policy inside the user-creation transaction;
public responses include `bootstrap`, `setupTokenRequired` and `mailConfigured`.
They never include the setup token or delivery credentials. Fresh mail availability
is used for authentication and sending, without a cached five-second policy window.

Every save includes its read revision. Concurrent first saves and later edits use
database compare-and-swap, returning a conflict instead of silently overwriting.
The page retains the draft until the administrator loads the latest version,
which keeps the fields they edited and takes every other field from the new
revision. Writes require a valid session, admitted administrator role and an Origin
in `ALLOWED_ORIGINS`, and are limited to 10 per administrator per minute. DTOs
reject extra configuration keys.

The public projection contains only site name, registration policy and the three non-secret setup/mail booleans.
Database URLs, encryption secrets, administrator email lists and stored provider
credentials never enter API responses. The Site tab displays deployment
availability for cleanup. To recover from a closed registration policy,
an existing admitted administrator can sign in and re-enable it.

## Resend email

In **Configuration center → Email**, enter a sender from a domain verified in
Resend, a sending API key and the default template language. The account
request's language takes precedence when available. Save to enable registration
verification and password-reset emails. Pausing delivery preserves the key.
Leave the key field blank when updating the other settings. A replacement is
encrypted with the deployment's `APP_KEY`; the key is never returned.
Authentication and test sends read saved delivery settings afresh. Saving alone
never sends a message. **Send test email** is limited to three requests per
administrator per minute, uses saved settings, and reports acceptance or a safe
failure without exposing provider diagnostics. Its recipient cannot be supplied
by the caller.

Verification mail, email sign-in codes and emailed password recovery show translated
unavailable states while mail is absent or paused. Password sign-in and copied
invitation links remain available. The administrator user list can issue a
15-minute, single-use password reset link while mail is unavailable. It requires
`users.password.reset`, fresh administrator authorization, a trusted Origin and a
three-per-minute admission limit. Issuance and its durable success audit commit
together; audit stores no token, password or URL. Issuing another link invalidates
previous password-reset links for that account. The response is no-store and the
UI holds the link only until its dialog closes. There is no link-read/list API.
Share it privately after verifying the recipient. A reset revokes account sessions;
this powerful recovery capability can allow account takeover and needs trusted admins.
Without mail, recovery requires an administrator who can still sign in. Configure
mail and keep another trusted administrator before losing the only administrator
session or password; no unauthenticated recovery bypass is added.

The existing optional `db:migrate --import-config` can seed missing delivery/storage
settings from explicit operator environment inputs. It is not needed to bootstrap,
and never replaces settings already saved in the center. Keep `APP_KEY` stable
and shared across API replicas. No earlier product database is imported.

## Server-side injection (IoC)

The configuration module uses factory injection. Its ports live in
`apps/api/src/config/types.ts`; consumers do not import the PostgreSQL
adapter. No decorators, global service locator or extra container library is needed.

- `ConfigReader` exposes `read()` for business rules and jobs.
- `ConfigService` adds `readCached()` for public, latency-tolerant reads,
  administrator checks and validated `update()`.
- `ConfigRepository` is the storage port. Its update must atomically compare
  the expected revision and return `null` on conflict, including competing first saves.

Inject the smallest interface a consumer needs. Transactional account admission
belongs to `admin/registration.ts`, which reads settings using the auth transaction.
A cached boolean precheck cannot assign the initial administrator or authorize
invitation-only registration. Runtime composition injects the fresh mail reader;
Auth owns session establishment and safe client feedback.

The cleanup job receives the site reader via `createCleanupJob`. API composition
registers the site snapshot, S3 provider and Resend client with one
`createConfigReads` per runtime. For a new configuration scope, register
its typed PostgreSQL loader in `source()`, use `read()` where policy requires
fresh values, and call `committed(scope, revision)` after the settings and audit
transaction commits. API and Web contracts keep their existing typed projections.

Direct writes use the same validation, administrator policy, audit editor and revision
checks as the GUI. Resolve the session from the server's authentication adapter for
the current request; never construct it from client-provided identity or retain it
between requests. Expired or mismatched sessions are rejected as well.

```ts
const auth = await runtime.readSession(request.headers);
const current = await runtime.config.read();
const saved = await runtime.config.update(
  { values: { ...current.values, siteName: "My workspace" }, revision: current.revision },
  auth,
);
```

`ConfigError.code` reports `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_INPUT`,
`CONFIGURATION_CONFLICT` or `CONFIGURATION_UNAVAILABLE`. Callers must handle a
conflict explicitly; do not retry with a fresh revision and overwrite another editor.
Browser-origin checks remain the responsibility of the HTTP boundary.
`runtime.readSession(headers)` uses the same authentication adapter as HTTP and
resolves the session on every call. The runtime does not retain a user's session.

For a custom adapter or a test double, construct the service directly:

```ts
const configuration = createConfigService({
  repository,
  access: createAccessPolicy(),
});
```

Platform entry points accept the same typed `RuntimeProviders` as an optional
second argument. For example, in a custom composition root:

```ts
// Bun: own one runtime for the process and close it on shutdown.
const runtime = await createApiRuntime(environment, {
  createConfigRepository: (db, audit) => repositoryFor(db, audit),
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
bun run --cwd apps/api test -- tests/integration/config.test.ts
bun run --cwd apps/api test -- src/config tests/integration/config-runtime.test.ts tests/integration/runtime-providers.test.ts src/jobs
bun run --cwd apps/web test -- src/features/config/config.component.test.tsx
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

The exclusive fresh-deployment browser fixture is `apps/api/tests/helpers/bootstrap-server.ts`.
Start it with `RAYPX_VALIDATION=1`, an empty disposable loopback `TEST_DATABASE_URL`,
`BOOTSTRAP_E2E_PORT=56539` and `BOOTSTRAP_E2E_WEB_URL=http://127.0.0.1:56540`.
Build Web with `VITE_API_URL=http://127.0.0.1:56539`, then run
`BOOTSTRAP_E2E_API_URL=http://127.0.0.1:56539 bun --cwd e2e --bun playwright test --config playwright.bootstrap.config.ts`.
It uses fake mail transport and cannot establish real inbox delivery. Stop that
owned fixture before database suites or the separately seeded backend fixture.
