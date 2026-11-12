# @raypx/account

## Purpose

Shared account projection, remote read state and DOM account views for Web,
Desktop and API. Auth continues to own authentication and credentials.

## Interface

- Root: `AccountProfile`, `AccountState` and `readAccount(client, { signal })`.
  Reads use an injected remote client, a five-second timeout and caller cancellation.
- `/access`: pure permission projections, `accessForRole`, `accessForAssignedRoles` and `hasPermission`.
  Guests have no account capabilities; members own personal remote features;
  administrators additionally read and update site configuration. Better Auth persists
  roles; its shared `/access` ACL supplies all grants, including composed assignments.
- `/client`: `AccountDetails`, `SignedOutAccount`, `AccountSkeleton`, `AccountMenu` and their types.
  Applications inject links, sign-out actions and feedback through props/children.
  The menu receives session identity and delegates navigation and logout to applications.
  Optional `variant="header"` uses a compact trigger and bottom-aligned popup; the
  default sidebar presentation stays unchanged. Applications inject additional menu
  items as children; Account never imports routing or permission-loading code.
- `/client/styles.css`: registers Tailwind sources for shared DOM account views.
- `/server`: `createAccountService({ readSession }).get(headers)` returns a fresh
  `{ id, email, name }` projection or null for each request.

## Constraints

Keep the root platform-neutral; DOM imports stay behind `/client`, and the
server entry never imports views. Use public workspace entries and keep the
dependency graph acyclic. Only Auth's pure `/access` entry supplies role rules;
never import its server, credentials, session adapters or forms here.

Do not own routes, client instances, session storage, HTTP handlers or database
queries. API owns protocol error mapping. Applications own SSR cookie forwarding,
navigation and session invalidation. Never expose credentials or extra user fields.

## Verification

Run `bun run --cwd packages/account check` and `bun run --cwd packages/account test`.
Web/Desktop route tests cover view integration; API tests cover RPC projection.

## Catalog ownership

Own `access` in `locales/<language>/`, with handwritten language entries
and pure `/messages/en` and `/messages/zh` exports. Support TS literal objects or
JSON nested strings, one format per namespace/language. Bind private translation
hooks through type-only catalog imports; applications supply the shared provider.
