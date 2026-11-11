# @raypx/testing

Shared test fixtures for Client and CLI. The root entry exports the manual scheduler,
deferred promises, and an in-memory relay socket.

Keep fixtures independent of the workspaces under test. Import this package from tests
through a direct development dependency. Keep test suites with the code they exercise.

Run `bun run --cwd packages/testing check` and the affected consumer tests.
