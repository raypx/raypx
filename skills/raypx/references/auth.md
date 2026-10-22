# Auth

Package: `@raypx/auth` ([AGENTS](../../../packages/auth/AGENTS.md)). Better Auth with
email and password; sign-in requires a verified email.

| Entry     | Use                                                                      |
| --------- | ------------------------------------------------------------------------ |
| `/server` | Better Auth factory. API injects the database adapter, config and mailer |
| `/client` | `createAuthClient` and the shared DOM `AuthForm` (browser only)          |
| `/hooks`  | Platform-neutral `useAuthActions` (busy state, safe error keys)          |
| `/types`  | Public account/session types without credentials                         |

- API mounts `/api/auth/*` and resolves the session on every account RPC; it never
  accepts actor IDs from clients.
- `ALLOWED_ORIGINS` is the exact trusted-origin list (Web, Desktop `views://main`,
  `raypx://`). `AUTH_DOMAIN` enables cross-subdomain cookies for sibling hosts.
- Web: `routes/(auth)` renders `AuthForm` per mode; `routes/(app)` redirects
  signed-out visitors in `beforeLoad`. Desktop gates its renderer with `SessionGate`.
- After sign-out clear the QueryClient and reset analytics identity before
  `router.invalidate()`.
- Account views and the safe `{ id, email, name }` projection live in `@raypx/account`.
