# @raypx/ai

## Purpose

The server-side AI adapter. It owns Pi SDK integration, provider lifecycle,
tool registration, and conversion to Raypx-owned run events.

## Interface

`src/index.ts` exports `AiRunEvent` and the cloud Pi, model Gateway and research
interfaces. `createCloudPiAgent` creates isolated server sessions with explicit trusted tools,
required model identity and per-attempt host usage hooks. Gateway transport runs
without local usage hooks. `checkPiRuntime` validates
the packaged SDK without opening a model connection.
`createModelGateway` dispatches the host's configured model and meters its actual
request. Runner injects a `ModelGatewayTransport` without a provider credential.
Research transport helpers protect DNS resolution and redirects.

## Ownership

This package owns Pi SDK integration and provider lifecycle. It does not own
HTTP transport, authentication, database connections, domain rules, or UI.

## Constraints

- Depend on domain interfaces, never on Drizzle, Hono, oRPC, React, or Web.
- Never read request sessions or create database connections.
- Keep provider and SDK types behind this package's small public interface.
- Hosts register trusted tools and bind their identity and resource scope.
  This adapter owns no project command registry or local Desktop provider.
- Never log prompts, credentials, tokens, or private project content.
- Cloud sessions disable cache warming, built-in tools, extensions, context-file
  discovery and provider-internal retries. Pi retries and compaction pass the
  same metered stream function; missing counts remain null.
- Usage hooks are awaited before dispatch and before final settlement. A failed
  persistence hook aborts the session instead of producing an unmetered result.
- Provider sessions reject missing usage hooks before SDK/session preparation.
  The trusted host supplies the Gateway's allowed tool names; Runner request
  context cannot extend that list.
- Gateway sessions disable Pi retries. A disconnected request is an unknown
  attempt; host settlement continues independently of the Runner.

## Verification

```bash
bun run --cwd packages/ai check
bun run --cwd packages/ai test
```

The real Pi integration test prepares the public SDK in `beforeAll` with a
120-second cold-import limit. The injected Gateway session keeps its separate
15-second execution limit; SDK preparation does not relax that assertion.
