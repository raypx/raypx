# Configuration center

Web exposes `/admin/settings` to admitted deployment administrators. It uses the existing API
and PostgreSQL foundation on Bun; there is no second admin
server or configuration package.

## First setup

1. Create a fresh isolated PostgreSQL database. Set `DATABASE_URL`, `PUBLIC_URL`,
   optional `API_PUBLIC_URL` for a separate API origin, and independent `AUTH_SECRET` and `APP_KEY` values.
   Apply the single current baseline with `bun run --cwd apps/api db:migrate`
   (or let the documented startup migration apply it). Never apply this baseline
   to an earlier/operator database.
2. Before public exposure, set optional API-only `SETUP_TOKEN` to a private random
   value of 32–512 printable ASCII characters. For example, generate one locally
   with `openssl rand -hex 32` and put it directly in the deployment secret store.
   Never use a `VITE_*` variable, build argument, URL or log for this value.
3. Open `/signup`. The first account becomes deployment administrator. If a token
   is configured, enter it in the masked setup field. Without mail, this account
   is immediately signed in and remains **unverified**. Signup returns to the
   workspace (or the validated return destination), without an installation flow.
4. The administrator workspace checklist links to Models in account settings and
   Sandbox/Email in the existing configuration center. A usable deployment model
   or the administrator's own usable model connection completes the required model
   item; it does not make that connection available to other members. Sandbox and
   mail are optional. The list observes current server state on mount, focus,
   visibility changes and every 30 seconds while visible. It disappears when all
   three are configured. Dismissal persists on this device under the API origin and
   account, survives sign-out, and does not affect another account or origin.
5. If mail is wanted, configure the sender, write-only delivery key and language, save, then use
   **Send test email**. It sends only to the current administrator's account email.
   An accepted send is not proof of inbox delivery; check the inbox.
6. Review **Site → Open sign-ups**. It is on by default. Turn it off for
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

`configuration.setupStatus` is a session-authorized, administrator-only renderer
read protected by `configuration.read`. It returns only `{ model, sandbox, mail }`
booleans. It reads account-owned model configuration and current saved sandbox/mail
settings without resolving Space membership, probing external providers or sending
mail. A model must resolve locally with a readable credential; sandbox requires an
enabled supervisor URL and credential; paused mail is unconfigured. These are
configuration observations, not connectivity guarantees. Failed reads remain
unavailable rather than reporting three missing settings. Members and guests are
refused before these reads. Public configuration is unchanged.

## Settings and precedence

The **Site** tab manages the settings below. The **Object storage** tab manages
attachment upload availability, the S3 location and write-only credentials.
The **Email** tab manages Resend. The **Sandbox** tab manages the deployment Computer
provider. Each tab has its own revision and saves
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
in the trusted origins derived from `PUBLIC_URL`, `API_PUBLIC_URL` and `EXTRA_ALLOWED_ORIGINS`, and are limited to 10 per administrator per minute. DTOs
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

The existing optional `db:migrate --import-config` can seed missing mail, storage
and sandbox settings from explicit operator environment inputs. It is not needed to bootstrap,
and never replaces settings already saved in the center. Keep `APP_KEY` stable
and shared across API replicas. No earlier product database is imported.

## Sandbox connection

Open **Configuration center → Sandbox** as a deployment administrator. Select
**Sandbox supervisor** for Docker or **E2B** for hosted command and file tools.
For Docker, enter the supervisor root URL and its dedicated bearer credential,
then choose whether to offer Screen. For E2B, enter the project API key. New
E2B configurations use the public `base` template and Raypx installs its
helper on startup. **Test connection** checks the saved destination. No
API/worker restart is required. Disabled is the default. Deployment
administration grants no Space access.

The Docker URL accepts HTTPS or HTTP with no embedded credentials, path, query or fragment.
Use HTTP only within an authenticated encrypted private tunnel (loopback is suitable
for local development). See [host reachability](sandbox-hosting.md#paas-reachability-without-wireguard)
for a PaaS API without WireGuard. A changed URL requires an explicitly supplied
credential so a retained secret cannot be sent to another origin. A blank credential
keeps the existing value at the same URL. It is encrypted with `APP_KEY`, bound to
that URL, and never returned in configuration responses, events or audits. Reads
return only `hasCredential`; audits contain only `sandboxEnabled`.

`configuration.sandbox`, `configuration.updateSandbox` and
`configuration.testSandbox` reuse the existing session/administrator permissions,
trusted-Origin mutation boundary, strict DTOs, CAS revisions, atomic success audit
and per-administrator limits. Testing accepts no destination or credential input,
allows three requests/minute, rejects redirects, caps the authenticated description
at 16 KiB and bounds headers and body to five seconds. Only connection status,
untrusted-tenant mode, `runc`/`runsc`/`other` runtime classification and actual Screen
availability are returned; arbitrary response text and diagnostics are discarded.
For E2B the test checks the saved project's API key and returns only a
connection status. Live provisioning and isolation have separate acceptance.

PostgreSQL is read freshly at operation admission and completion in both API and
worker roles; only the adapter for the exact saved revision is reused. The existing
`sandbox` configuration reader scope and optional Redis invalidation follow the
mail/storage path. Fresh PostgreSQL reads also work across processes without Redis
or during missed notifications. Construction performs no database/network I/O.
Commands and Screen streams recheck revisions at least every second while waiting
for data. A change closes their old stream, cancels known commands best effort and
refuses to publish success from the retired revision. New Runs without a configured
sandbox continue without Computer tools; pinned Runs never switch computers.

On E2B, the credential is encrypted against the fixed E2B API destination.
Switching between Docker and E2B requires a credential for the selected
backend. A Computer stays bound to the backend and template or URL it first
used. Use a fresh Space to test a different backend. See
[E2B setup and acceptance](sandbox.md#e2b-hosted-computers).

A private `computers.supervisor_url` binds a computer before its first remote
provision. Changing the destination leaves existing computers unavailable, with
`PROVIDER_UNAVAILABLE`, rather than provisioning an empty replacement home. New
Spaces use the new destination. Restore the original URL/credential to regain
access to retained computers. Stop/drain them before moving hosts, and preserve
supervisor state through an operator-reviewed move. Disabling refuses new operations;
it cannot prove that an unreachable host stopped compute. An admitted provision
finishing after a change is stopped at its original destination best effort and
recorded as failed. Unknown remote outcomes stay unknown. Supervisor idle/lifetime
containment remains necessary; disabling is not a host drain or migration.
Screen is offered only when both the saved switch and supervisor capability permit
it. Image/runtime, egress, quotas and all host limits remain supervisor-owned.

Only explicit `db:migrate --import-config` (or `DB_MIGRATE_IMPORT_CONFIG=true`) reads
`COMPUTER_PROVIDER=none|docker`, `SANDBOX_SUPERVISOR_URL`,
`SANDBOX_SUPERVISOR_TOKEN` and `COMPUTER_SCREEN_ENABLED=true|false`. It seeds a missing
row inside the migration transaction and never replaces a saved row. These inputs
are absent from the API/worker runtime environment contract; changing them does
nothing to an existing deployment setting. Compose forwards them to `migrate`,
while the supervisor separately needs its own host token and image configuration.
Backend `COMPUTERS_PER_SPACE`/`COMPUTERS_PER_MEMBER` remain record-quota deployment
inputs, independent of supervisor enforcement. Keep `APP_KEY` stable across roles.

The unreleased foundation now includes `sandbox_configuration` and the private
computer placement column. Exactly one baseline was regenerated, with no incremental
migration or backfill. An already deployed test database must be wiped before
applying this baseline; never apply it over an operator or retired database.

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
registers the site snapshot, S3 provider, Resend client and sandbox adapter with one
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
Build Web once, then set its runtime API origin while running the gate:
`BOOTSTRAP_E2E_API_URL=http://127.0.0.1:56539 bun --cwd e2e --bun playwright test --config playwright.bootstrap.config.ts`.
It uses fake mail transport and cannot establish real inbox delivery. Stop that
owned fixture before database suites or the separately seeded backend fixture.
