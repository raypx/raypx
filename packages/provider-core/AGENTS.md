# @raypx/provider-core

Private provider source library. CLI owns execution policy, storage, process transport and lifecycle. Never import applications, authentication or database implementations. Export only explicit public entries.

Run this workspace check and CLI adapter/replay tests, then repository verify.

`ProviderSession` and injected `SessionFactory` support process and in-process SDK lifetimes. Completion is `Promise<void>`: it means all session activity has drained, not a process exit code. `ConversationEvent` is the only conversation input to the CLI coordinator. Raw provider protocol envelopes stay in concrete adapters. Keep process start/transport contracts separate from the session factory; never require an executable for an SDK session.

Provider availability includes a versioned definition for runtime kind, supported modes, approvals and model selection. Concrete adapters own their definitions; discovery supplies current availability/input modes. Execution validates capabilities independently of the UI.
