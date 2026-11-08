# @raypx/providers

Private provider source library for the CLI's private harness. CLI owns execution policy,
storage, process transport, files, credentials, SQLite and lifecycle. Never import
applications, authentication or database implementations. Export only explicit entries.

- `./core`: `ProviderSession`, injected `SessionFactory`, process start/transport ports and
  normalized `ConversationEvent`s. Completion is `Promise<void>` and means all session
  activity has drained, not a process exit code. Never require an executable for an SDK session.
- `./claude`, `./codex`: process adapters for the private stream-json and app-server
  protocols. Raw envelopes stay in these adapters; they depend only on `./core` and Core.
- `./pi`, `./pi/context`: the injected Pi SDK session, bounded SDK loop and transcript
  schema. Only `src/pi/**` targets Node and imports `@raypx/ai` or
  `@earendil-works/pi-agent-core`. Persist tool intent before effects and results before
  inference. Never replay unresolved effects or expose reasoning, tool arguments or raw
  errors as activity.

Each adapter owns a versioned definition for runtime kind, modes, approvals and model
selection; discovery supplies availability and execution validates capabilities.
Cross-adapter imports go through `src/core`; adapters never import each other.

`tests/helpers` holds the test-only host, transport fake and shared conformance suites;
runtime entries never import it. Keep fakes at the transport/SDK boundary, verify replaced
handles cannot emit or approve work, and that cancellation waits for transport/SDK drain.

Run this workspace's check and tests, CLI adapter/replay/provider tests, then repository verify.
