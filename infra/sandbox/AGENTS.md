# Sandbox supervisor

Private Bun service; no exports. Only this service opens the Engine socket.
The backend consumes `@raypx/providers/computer/docker` over authenticated private HTTP.
Never log request bodies, Engine errors, commands, output, paths or tokens.
Validate configuration before opening a listener. Persist generation tombstones and
immutable home snapshots in the supervisor's private state volume. Run one supervisor
per state volume; computer operations serialize there. Never share its socket or state
with computers. Provision uses existing images only, never pulls or builds.

`src/home.py` is baked into the computer image; file operations walk directory FDs
with O_NOFOLLOW. Home archives preserve links without following them and reject special files.
Run `check` and `test` without Docker; tests inject a fake Engine HTTP transport.
Live provider conformance is opt-in via RAYPX_TEST_DOCKER=1 against a prepared service.
