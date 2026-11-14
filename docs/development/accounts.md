# Accounts, sessions and access

This guide covers account/session behavior, authorization and Web OAuth setup.
API remains authoritative; native local ownership is separate from online login.

## Sessions and account settings

The Web account page supports editing the display name, changing the password and
reviewing active sign-in sessions. These use the existing Better Auth endpoints; no schema change
or additional service is required.

Web's public landing/legal/authentication pages and device preferences remain
available to guests. Agents, Pages, Space controls and private account settings
mount only after session resolution; administrator pages send guests to login.
A failed session check shows retry feedback rather than treating the user as a
guest. API authentication and fresh Space membership remain authoritative.

Login accepts allowlisted relative destinations and defaults to `/agents`.
Verification/reset and supported sign-in callbacks preserve those destinations.
The former guest task editor and handoff are removed. Agent drafts and uncertain
send receipts stay scoped to origin, account, Space and conversation; restoration
never sends or repeats an approval. Mobile restores only validated protected routes.

- Name saves trim whitespace, retain drafts on failure and refresh the cached
  account projection after success.
- Password changes require the current password and default to signing out other
  sessions. Better Auth rotates the current session when this option is selected.
  The settings action opens a compact dialog with a link for a forgotten password.
  Cancel, Escape and backdrop dismissal
  discard its drafts and return focus to the action without closing settings.
  Dismissal is disabled while the change or account refresh is pending.
  Password changes invalidate remote device credentials through Control's security
  version; local work is unaffected. Password fields clear after success. A failed
  account refresh retries only that refresh, never the password mutation.
- The Web password category checks whether the account has a password login method.
  Accounts without one can request a setup link sent to their account email.
  Better Auth's existing reset flow validates the single-use link and adds a
  password to the same account. This requires working account email delivery.
- Shared auth forms recover missing/expired reset links with a new-link action and
  replace completed resets with sign-in. Failed post-login navigation retries only
  the application follow-up. Shared hooks and form tests live in Auth.
- Authentication pages share theme and language menus. Password inputs warn about
  Caps Lock; registration, reset and password changes show live length feedback from
  the shared password policy. This is a length check, not a strength estimate.
- Verification and reset mail forms disable repeat sends for 60 seconds after success.
  HTTP 429 uses Better Auth's `X-Retry-After` or standard `Retry-After` when available,
  with a 60-second default. API CORS exposes these delays to trusted browser origins.
  Other failures remain immediately retryable; countdowns stay in component memory
  and never replace server rate limits.
- The current session is identified explicitly and cannot be revoked from its
  own list row. The existing Sign out action handles the current session.
- Other sessions can be signed out individually or together, after confirmation.
  Session management accepts any valid login (`freshAge: 0`), including sessions
  created more than 24 hours ago. Revocation still resolves an authoritative session.
- Lists are account-scoped component state. Session tokens never enter markup,
  persistent browser storage, query caches or diagnostics.
- A failed read keeps the refresh action available. A failed mutation retains
  its dialog for a deliberate retry, including an ambiguous network response.

Web component tests cover interaction, recovery and token visibility. Auth's
memory-adapter integration tests exercise real registration, verification, sign-in,
profile updates, ownership checks and revocation through the auth HTTP handler.
PostgreSQL and mail-provider checks remain separate deployment gates.

Name creation and updates trim whitespace and enforce 1–80 UTF-16 characters on
the server. Shared policy also fixes password limits at 8–128 characters. Profile,
password-change and session-revocation mutations require an exact trusted
Origin, including the native `views://main` origin; missing/external origins fail.

Desktop uses system-browser sign-in and a private daemon-owned cookie transport;
Mobile uses the Expo session adapter and origin-scoped SecureStore. Sessions do
not transfer between origins. New Agent execution stays in the backend. Retained
CLI local tools still require their own enrolled profile and remain independent
of online logout; that identity grants no Space permission.

## Roles and permissions

Raypx extends the Better Auth 1.7 Admin plugin and its access controller. Roles are
persisted in the foundation user table; no email allowlist overrides authorization.

| Role     | Assignment                                                  | Web navigation                                        |
| -------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| `guest`  | No valid verified account session                           | Public pages and device preferences                   |
| `member` | Default persisted Better Auth role                          | Agents, Pages, Space controls and account settings    |
| `admin`  | Assigned through Better Auth or explicit operator bootstrap | Member navigation plus the Web administration console |

Apply the current PostgreSQL migrations to the isolated platform database before
deploying. Admin role/ban fields and session attribution live there; they never
read or import the retired product database. A deployment role grants no Space
access without membership.

Register and verify the intended administrators, set explicit `DATABASE_URL` and
`ADMIN_EMAILS`, then run `bun run --cwd apps/api auth:bootstrap-admins`. This operator
command validates all selected accounts before writing, skips existing admins and
updates roles through Better Auth's adapter, including session-cache refresh. It
does not migrate or create users. A storage failure can leave some promotions
committed; retrying is safe. `ADMIN_EMAILS` is used only by this explicit command.
Restarting the API does not promote a previously downgraded account.

Core's `/permissions` owns the pure vocabulary used by wire schemas. Auth's `/access`
uses Better Auth's `createAccessControl` and `newRole` for the shared role policy;
the `raypx` resource contains product permissions. The Admin plugin and Account's
projection consume the same ACL. Supported comma-separated assignments compose
grants; missing and unsupported roles fail closed, including `admin,unknown`.
The public `account.access` RPC accepts an
empty input and returns only `accountId`, `role` and `permissions`; invalid, expired
or mismatched sessions receive the guest projection. Session failures remain errors.
Neither RPC input nor cached browser session data assigns a role.

Web's `authClient` includes `adminClient` with the shared ACL. Administrators can
use `admin.listUsers`, `admin.getUser` and `admin.setRole({ userId, role: "admin" })`.
After a successful role change, invalidate `queryKey: ["account-access"]` to refresh
visible menus. Administrators receive only user list/get/set-role operations.
Impersonation, deletion, password changes and moderation operations are not granted.
Web provides the `/admin/users` management page; native auth methods remain unchanged.

Registration and profile updates cannot assign roles. Mutations require a trusted
Origin and a fresh verified, unbanned user's ACL. `readAuthSession` reloads the user
record even with Redis session storage. Admin endpoint pre-checks also read that
record so a failed cache refresh cannot preserve administrator privileges.
Authenticated `admin.hasPermission` checks use that same fresh record. Local
`checkRolePermission` is a display hint, never authorization for the signed-in user.

Web declares page requirements in `features/auth/access.ts`. Menu filtering and
`PermissionBoundary` use the same permission names. Permission queries are keyed
by API origin and account, check the returned account ID, refresh on private-page mounts,
focus and every 30 seconds while visible, and fail closed on errors. Direct private
navigation waits for permission before mounting the feature. Guests can still open
existing public pages and contextual sign-in gates. Sign-out clears account queries.

The API checks permissions on each remote feature request, then retains existing
account ownership, device grants, trusted-origin checks and revision validation.
Configuration reads and writes require separate `configuration.read` and
`configuration.update` permissions, including direct service writes. Hiding a menu
never grants access or replaces server checks. Account-scoped reads do not let
administrators access another person's devices or content.

Retained CLI projects, approvals, schedules and memory remain local after
Device preferences need no login. This role policy governs account-owned remote work
and Web administration, not device ownership or OS command permissions.

When adding a role or permission, update Core's vocabulary and Auth's ACL, the API handler
and Web page requirement together. Test denied direct requests, active-session role changes and page mounts in
addition to menu visibility. Never derive privileges from browser storage.

See [Better Auth Admin documentation](https://better-auth.com/docs/plugins/admin).

### User management and route guards

Web administrators open `/admin/users` from navigation or the shared account menu.
The page uses Better Auth's existing list-users and set-role methods, with 20-row
server pagination and explicit name/email searches. `users.read` and
`users.roles.update` are Core permission names granted only to administrators by
Auth's ACL. The UI offers the fixed `member` and `admin` roles and confirms every
change. Users with `users.read` can inspect the permissions granted by each account's
assigned roles. The edit dialog previews the permissions added or removed by the
selected role using the same ACL. Unknown assignments display an empty grant list
and require an explicit role selection before saving.
Neither the UI nor the HTTP handler allows a user to change their own role.
A failed list refresh after a successful write retries only that refresh. There are
no custom roles, team memberships or additional user administration operations.

Every private Web feature has a `beforeLoad` guard before its component and loader.
The shared page policy also controls menu visibility. Existing guest workspaces stay
public: guests can edit drafts and see contextual login gates. Signed-in project
reads require `projects.read`; device preferences stay public. Administrator pages
redirect guests to login with an allowlisted return destination. Permission denial
and unavailable services have separate safe feedback and retry handling. SSR access
reads forward only Better Auth cookies through a per-request client. Live boundaries
continue to refresh grants on focus and every 30 seconds; API checks remain immediate.

Login and signup redirect confirmed accounts to the allowed destination, defaulting
to `/agents`. Verification, recovery and OAuth callbacks keep their own flows.
A pending guest draft handoff finishes in the browser, never during SSR or preloading.
The homepage resolves its compact account button after hydration without blocking
public content. Its menu and the sidebar share Account, Settings, permission-filtered
administration links and sign-out behavior.

### Dedicated administration area

`/admin` is a Web-only route group with an independent shell. Its overview, user
management, site settings and audit pages never mount personal project, task,
notification or approval queries. The workspace and public account menus link to
one Admin console entry. `admin.read` admits administrators and protects overview
and dependency status; `audit.read` protects history. Existing user/configuration
permissions still protect their feature requests. These are fixed admin grants,
not custom roles. The HTTP `admin.overview`, `admin.health` and `admin.audit` methods
are explicitly `web` in the native exposure policy and enter no Desktop allowlist.

Overview counts come from the foundation user table, including unverified accounts
in the total. The selected seven/thirty-day UTC window includes today; missing
registration dates are real zeroes only after a successful read. Statistics and
three-second dependency probes fail independently. Dependency status describes the
responding API instance, not a fleet-wide uptime guarantee. No model/provider
credentials, connection addresses or another person's project content are returned.

#### Durable audit

The `admin_audit` table keeps management history independently of account lifetimes.
Authenticated, admitted role/configuration mutation requests first write a durable
intent using the server's request ID and fresh session actor. A separate admission
limit bounds audited HTTP writes to 60/minute per account; anonymous and pre-admission
traffic remains in sanitized diagnostics. No request bodies, cookies, passwords,
tokens, IP addresses or diagnostic prose enter history. Only supported role values
and non-secret site settings appear in change snapshots.

The API-owned Better Auth database adapter wraps actual role writes and their
success audit in one PostgreSQL transaction. HTTP role changes lock the actor and
target rows in account ID order and recheck the actor's grant before writing. If
two administrators try to demote each other concurrently, only one write commits
and the other request is recorded as rejected. Better Auth retains validation,
self-change protection and session-cache updates. Explicit bootstrap uses the same
adapter with an operator identity. Configuration CAS updates write their success
history in their transaction as well; direct service writes create their own intent.
Custom runtime configuration repositories receive the runtime audit service and
must provide the same atomic contract. They cannot silently disable audit.

Audit failure prevents the mutation or rolls its transaction back. Known permission
refusals and execution failures finalize only pending entries. A success record is
never overwritten when response delivery or a post-commit cache refresh fails.
A timed-out request can finish after its response: its pending intent becomes
Unconfirmed after 30 seconds until the real transaction result arrives. History
never guesses that a timeout rolled back a write. Terminal records have no update
or delete interface and are excluded from background cleanup.

History is retained indefinitely. Queries default to 30 days, support historical
windows of up to 366 days, and use (startedAt, id) cursors with 50 rows by default
and a 100-row upper bound. All filters apply before pagination. Deleted actors and
targets retain stable identifiers. There is no export, login/security-event audit,
or general cross-account content access in this delivery.

Deploy the generated foundation migration before the API and Web changes. An
unmigrated or unavailable audit store blocks administration writes; it never falls
back to unaudited updates. Use an isolated `_test` PostgreSQL database for the
administration acceptance suite. Do not apply this migration to retired databases.

## Social login

Web supports Google and GitHub OAuth through the API's Better Auth handler.
Email/password login remains available. Providers appear on login and signup only
when both of their credentials are configured; missing pairs fail API startup.
The public `GET /api/auth/social-providers` response contains enabled provider names
only. Credentials are API runtime settings, never `VITE_*` values or build arguments.

### Provider setup

Create separate applications for development and each deployed environment.

| Provider | API runtime variables                      | Authorized callback URL                |
| -------- | ------------------------------------------ | -------------------------------------- |
| Google   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `${AUTH_URL}/api/auth/callback/google` |
| GitHub   | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | `${AUTH_URL}/api/auth/callback/github` |

`AUTH_URL` is the API's public origin; a gateway serving Web and API can use the
same public origin for both. Register the exact callback URL without a trailing
slash. For local development the callbacks are
`http://localhost:3002/api/auth/callback/google` and
`http://localhost:3002/api/auth/callback/github`.

In Google Cloud Console, configure the OAuth consent screen and create a **Web
application** OAuth client. Add the Web origin to authorized JavaScript origins
and the API callback to authorized redirect URIs. While the consent screen is in
testing, add the intended Google test users.

In GitHub developer settings, create an **OAuth App**. Set the homepage to the Web
origin and the authorization callback to the API callback. The built-in provider
requests the profile/email access needed for login, including private email.

Put the credentials in the API environment and restart API. Compose forwards all
four optional variables from its environment file. On Railway, configure them on
the API service. Leave both values empty to disable a provider. Keep the Web origin
in `ALLOWED_ORIGINS`; sibling Web/API subdomains also require the existing
`AUTH_DOMAIN` cookie setting so Web SSR can see the session.

### Behavior and boundaries

Desktop opens the system browser and requires explicit consent for the displayed
account. PKCE, state, issuer and callback verification protect the exchange. The
daemon verifies the current account, stores cookies in its encrypted private
session database and bridges bounded server requests/events. Switching account or
signing out revokes the affected connector. Enrollment, offline identity receipts
and Host reauthorization do not exist. See [Desktop](desktop.md).

### Sign-in methods and account protection

In Web, open **Settings → Account → Password** to add or remove passkeys, link or
unlink configured Google and GitHub accounts, and configure an authenticator app.
A supported browser can sign in with a passkey using its authenticator. Set
`AUTH_PASSKEY_RP_ID` to a shared parent domain if Web and API use sibling hosts.
Keep the exact Web origin in `ALLOWED_ORIGINS`. Use HTTPS outside localhost. Keep
the RP ID stable after deployment because it scopes existing credentials.

Email sign-in codes use the existing Resend configuration. Codes are valid for
five minutes, allow up to three verification attempts and are single-use. They
sign in existing accounts. For accounts with TOTP enabled, password login in
Web and Expo requires an authenticator code or a single-use backup code.
Keep backup codes somewhere separate from the authenticator. Replacing the codes
invalidates the previous set. Passkeys and social identity providers authenticate
through their own credentials. Email-only login is unavailable while TOTP is enabled.

Set `AUTH_CHECK_COMPROMISED_PASSWORDS=true` to check new passwords during
registration, change and recovery. The service sends a short hash prefix to
Have I Been Pwned and checks the full match locally. Password changes require
the service to be reachable while the check is enabled.

Set both `AUTH_TURNSTILE_SITE_KEY` and `AUTH_TURNSTILE_SECRET_KEY` to protect
requests that send sign-in codes. Register the Web hostname in the Turnstile
widget configuration. API returns the public site key to the Web form and
validates each challenge token before sending mail. Compose forwards both
values. On Railway, set both on the API service.

### Device pairing

The connector uses short-lived pairing claims and native consent, followed by
separate Space directory confirmation. Pairing grants no Space access. Shared
Spaces use the backend membership/invitation model. See
[device computers](device-connector.md).

### Verification

Auth tests exercise both providers' authorization and callback routes using
mocked provider responses, including cancellation, email verification, registration
policy and untrusted callback rejection. Web route tests cover destination
preservation and completion. Real provider login additionally requires configured
OAuth applications and an interactive browser; mocked callbacks do not verify
provider console settings or live credentials.
