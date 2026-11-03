# Account roles and menu permissions

Raypx extends the Better Auth 1.7 Admin plugin and its access controller. Roles are
persisted in the foundation user table; no email allowlist overrides authorization.

| Role     | Assignment                                                  | Web navigation                                               |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| `guest`  | No valid verified account session                           | Projects home and device settings                            |
| `member` | Default persisted Better Auth role                          | Projects, waiting approvals, automations, memory and account |
| `admin`  | Assigned through Better Auth or explicit operator bootstrap | Member navigation plus site settings                         |

Apply the generated foundation migration before deploying this version. It adds
Admin's role/ban fields and session attribution; existing foundation users become
members. It never reads or imports the retired product database.

Register and verify the intended administrators, set explicit `DATABASE_URL` and
`ADMIN_EMAILS`, then run `bun run --cwd apps/api auth:bootstrap-admins`. This operator
command validates all selected accounts before writing, skips existing admins and
updates roles through Better Auth's adapter, including session-cache refresh. It
does not migrate or create users. A storage failure can leave some promotions
committed; retrying is safe. `ADMIN_EMAILS` is used only by this explicit command.
Restarting the API does not promote a previously downgraded account.

Core's `/permissions` owns the pure vocabulary used by wire schemas. Its `/access`
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

Desktop local projects, approvals, schedules, memory and device preferences remain
available without an account. This role policy governs account-owned remote work
and Web administration, not device ownership or OS command permissions.

When adding a role or permission, update Core's vocabulary and Auth's ACL, the API handler
and Web page requirement together. Test denied direct requests, active-session role changes and page mounts in
addition to menu visibility. Never derive privileges from browser storage.

See [Better Auth Admin documentation](https://better-auth.com/docs/plugins/admin).

## User management and route guards

Web administrators open `/admin/users` from navigation or the shared account menu.
The page uses Better Auth's existing list-users and set-role methods, with 20-row
server pagination and explicit name/email searches. `users.read` and
`users.roles.update` are Core permission names granted only to administrators by
Auth's ACL. The UI offers the fixed `member` and `admin` roles and confirms every
change. Neither the UI nor the HTTP handler allows a user to change their own role.
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
to `/projects`. Verification, recovery and OAuth callbacks keep their own flows.
A pending guest draft handoff finishes in the browser, never during SSR or preloading.
The homepage resolves its compact account button after hydration without blocking
public content. Its menu and the sidebar share Account, Settings, permission-filtered
administration links and sign-out behavior.

## Dedicated administration area

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

### Durable audit

The `admin_audit` table keeps management history independently of account lifetimes.
Authenticated, admitted role/configuration mutation requests first write a durable
intent using the server's request ID and fresh session actor. A separate admission
limit bounds audited HTTP writes to 60/minute per account; anonymous and pre-admission
traffic remains in sanitized diagnostics. No request bodies, cookies, passwords,
tokens, IP addresses or diagnostic prose enter history. Only supported role values
and non-secret site settings appear in change snapshots.

The API-owned Better Auth database adapter wraps actual role writes and their
success audit in one PostgreSQL transaction. Better Auth retains validation,
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
