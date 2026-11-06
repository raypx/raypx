# Node-compatible runtime services

Small Node-compatible filesystem, process and HTTP services run under Bun for CLI, Relay and
repository tooling. Keep application execution, authorization and scheduling in
their owners. Public entries require real consumers. Never depend on Tooling:
its task registration follows the TypeScript presets' bootstrap pattern.

Process streams use Web Streams at this boundary; native process lifetime and
backpressure remain explicit. Inherited-stream runners forward interrupts and
clean up signal handlers; use cross-spawn for Windows executable/shim resolution.
The bootstrap task script uses these runners without importing Tooling.
HTTP listeners bind asynchronously and local
requests always use a direct dispatcher, including Unix sockets.
