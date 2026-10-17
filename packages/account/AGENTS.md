# @raypx/account

## Purpose

Shared account projection, remote read state and DOM account views for Web,
Desktop and API. Auth continues to own authentication and credentials.

## Interface

- Root: `AccountProfile`, `AccountState` and `readAccount(client, { signal })`.
  Reads use an injected remote client, a five-second timeout and caller cancellation.
- `/client`: `AccountDetails`, `SignedOutAccount`, `AccountSkeleton` and their types.
  Applications inject links, sign-out actions and feedback through props/children.
- `/client/styles.css`: registers Tailwind sources for shared DOM account views.
- `/server`: `createAccountService({ readSession }).get(headers)` returns a fresh
  `{ id, email, name }` projection or null for each request.

## Constraints

Keep the root platform-neutral; DOM imports stay behind `/client`, and the
server entry never imports views. Use public workspace entries and keep the
dependency graph acyclic. This package has no dependency on auth.

Do not own routes, client instances, session storage, HTTP handlers or database
queries. API owns protocol error mapping. Applications own SSR cookie forwarding,
navigation and session invalidation. Never expose credentials or extra user fields.

## Verification

Run `bun run --cwd packages/account check` and `bun run --cwd packages/account test`.
Web/Desktop route tests cover view integration; API tests cover RPC projection.
