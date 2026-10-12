# @voidmix/client

## Purpose

The transport adapter. `createApiClient({ baseUrl?, headers, fetch })` returns a
typed client generated from the shared contract. Web and Desktop provide an
absolute API origin and send credentialed requests.

## Interface

| Path              | Purpose                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `.`               | `createApiClient`, `ApiClient`, and client option types                   |
| `./cloud-runs`    | Canonical cloud Run session and ordered event transport                   |
| `./conversations` | Conversation session, live projection and explicit older pages            |
| `./runs`          | `createRunSession`, `createApiRunTransport`, snapshot and transport types |

## Ownership

- Own the transport wiring: base URL, headers, the injectable `fetch`, and the
  HTTP method policy needed by the oRPC beta transport plugins.
- Keep that policy limited to safe read batching/deduplication and mutation
  safety; the client type remains `ContractRouterClient<typeof apiContract>` —
  **fully generic**.
- `@voidmix/contracts` owns `isMutationProcedure` in `methods.ts`. Client and API both
  consume it so safe-read batching and mutation POST routing cannot diverge.

## Constraints

- **`src/index.ts` normally needs no edit when the API changes.** New procedures
  appear on `createApiClient(...)` automatically because the type is derived from
  `@voidmix/contracts`. If you find yourself adding a per-procedure method here,
  the change belongs in `@voidmix/contracts` instead.
- `fetch` is injectable and that is load-bearing: `apps/api/server/api`'s integration test
  passes the Hono app directly (`fetch: async (input, init) => app.fetch(new Request(input, init))`)
  to exercise the whole stack in-process with no network.
- Procedures are never zero-arg. `client.health({})` needs the explicit `{}`.
- Depend only on `@orpc/client`, `@orpc/contract`, and `@voidmix/contracts`.
  Never import `@voidmix/db`, `@voidmix/core`, or any application.
- Native fetch owns HTTP response decompression. Do not install the oRPC
  response decompressor on this Fetch transport; it would decompress twice.
  Request compression and server response compression remain enabled.
- Consumers own their own headers. Do not bake actor identity, auth, or
  environment lookups into this package.
- Run session factories perform no I/O until `reconnect`; apps scope and dispose
  them. Streams use `createStreamingApiClient` without batching or request timeout.
- Snapshots stay reference-stable until an update. Reject cross-run events,
  resume from contiguous sequence, and never treat EOF as execution success.
- `dispose` closes transport only; cancellation is an explicit durable command.

## Verification

```bash
bun run --cwd packages/client check
bun run --cwd packages/client test
bun run --cwd apps/api test:integration   # real in-process exercise
```

## Cloud sessions

- `./cloud-runs` exports `createCloudRunSession` (`createRunSession` alias) and
  `createCloudRunTransport`. It uses the canonical `cloud.runs` contract.
- `./conversations` exports `createConversationSession` and its API transport.
  Conversation streams merge recent durable projections with loaded history;
  `loadHistory` pages backward using the account/resource-bound cursor. Root Run streams
  resume ordered events from the snapshot cursor. Run snapshots include complete
  durable message projections and bounded recent events; `loadHistory` pages
  backward explicitly without blocking the first render or stream connection.
- Reconnecting the same conversation renews its SSE connection without cancelling
  an in-flight history page. History requests have an independent lifetime;
  disposal or a fatal permission/authentication error aborts them.
- Factories never perform I/O during construction or SSR. Mounted applications
  scope each instance by account/resource and start it with `reconnect`.
- Ignore duplicate events, reject another resource, recover sequence gaps from
  a fresh projection, and refresh after entity/terminal events. EOF never means
  a successful execution. Disposal aborts stale generations and no durable work.
- `refresh` coalesces a snapshot-only read without reconnecting SSE. The first
  Conversation connection reuses a Router bootstrap; its stream begins with a
  fresh authorized projection. `settled` becomes true only after a terminal Run
  has refreshed its durable final facts. Auth/access denial clears private data.
- `./runs` remains only for the deferred Desktop local-run integration.
