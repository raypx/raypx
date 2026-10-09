# @raypx/logger

Server-only structured logging using the installed evlog API. No authentication, database or application dependencies.

Call `configureLogging({ environment, level, version })` during application initialization. Production writes JSON; development uses readable output. `createLogger({ name })` supports `info(message, fields)` and the existing `info(fields, message)` style, with trace/debug/info/warn/error/fatal levels. Numeric levels 0–5 remain supported.

`withLogContext({ requestId }, operation)` isolates correlation fields across concurrent requests and carries them into infrastructure loggers. `child(fields)` attaches explicit context for background operations.

Credentials in structured fields, headers and connection URLs are redacted in every environment. Errors retain their name, message, stack and cause for server diagnostics. Do not log raw request bodies or credential values. A failing log sink does not change the operation's outcome.

Use `@raypx/logger` through its package exports. Browser packages cannot import it.
