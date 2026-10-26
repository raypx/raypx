# @raypx/logger

## Purpose

Private structured logging shared by API and CLI while the product workflow settles.
This source workspace owns logging; consumers need no Kit logger release or archive.

## Interface

- `.` exposes evlog's native logger, error and configuration APIs/types.
- `/context` binds an existing logger to Node/Bun asynchronous work.
- `/pipeline` exposes evlog's native batch transport.
- `/safe` projects bounded events through caller-owned field policies.
- `/managed` supplies independent bounded delivery, statistics and lifecycle.
- `/stream` writes ordered JSON lines to stderr or a caller-owned Node stream.

## Constraints

Keep evlog external and use only public entries. Do not import applications,
configuration, database or business schemas. API owns routes, allowed fields and
PostHog settings; CLI owns diagnostic categories and stdout/protocol separation.
`initLogger` is global to a process/isolate and is called once by the application,
never by package imports. Creating a managed drain does not reconfigure evlog.
Keep `/safe` and `/managed` free of Node built-ins. `/context` and `/stream` are
Node/Bun only. Context helpers do not emit, and nested scopes restore the parent.
Managed admission bounds queued plus active events; overflow drops new events.
Do not retry failed sinks. Report delivery loss on flush without private errors.
Close stops admission and is idempotent. Its deadline bounds waiting, not an
uncancellable sink; transports own I/O cancellation.
Preserve the source notice and license. No compiled library artifact is required.

## Verification

Unit tests live under `tests/unit`; `tests/types/public.ts` checks public types
without running. Run this workspace's check/test, API logging tests, then root
`bun run verify` for actual Node/Worker outputs and the relocated standalone CLI.
