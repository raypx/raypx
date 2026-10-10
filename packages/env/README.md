# Runtime configuration

`@raypx/env/server` validates server configuration with Zod and returns inferred,
read-only types. `@raypx/env/client` contains only explicitly supported public
configuration. No public fields currently exist. There is no mixed root export.

```typescript
import { loadServerEnv, getServerEnv } from "@raypx/env/server";

// Validate before accepting requests. Importing the module does not read env.
loadServerEnv();
const { PORT, LOG_LEVEL } = getServerEnv();
```

`parseServerEnv(input)` validates a supplied object without reading global state.
`loadServerEnv(input = process.env)` explicitly validates and stores configuration.
`getServerEnv()` returns the stored configuration, validating `process.env` on
first use if startup has not already loaded it. An invalid explicit reload throws
and leaves the last successful configuration intact.

| Field         | Default       | Validation                                                   |
| ------------- | ------------- | ------------------------------------------------------------ |
| `NODE_ENV`    | `development` | `development`, `test`, or `production`                       |
| `HOST`        | `127.0.0.1`   | IPv4, IPv6, or hostname; no scheme or port                   |
| `PORT`        | `3000`        | Decimal integer between 1 and 65535                          |
| `NITRO_HOST`  | uses `HOST`   | Overrides the effective listening host; same validation      |
| `NITRO_PORT`  | uses `PORT`   | Overrides the effective listening port; same validation      |
| `LOG_LEVEL`   | omitted       | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` |
| `APP_VERSION` | omitted       | String of at most 128 characters                             |

Leading and trailing whitespace is removed. Empty or whitespace-only strings
count as unset, using defaults or omitting optional fields. Nonblank `NITRO_HOST`
and `NITRO_PORT` take precedence over `HOST` and `PORT`. Only the effective
listener values are validated, and errors identify the source field. The result
always exposes the effective values as `HOST` and `PORT`. Unknown fields are
stripped. Returned configuration is frozen. `ServerEnvironmentError` contains
only invalid field names and fixed validation rules; supplied values and raw
Zod issues are never retained in the error.

See [ENV.md](../../ENV.md) for application wiring, file location, and read timing.
`bun run check:env` checks development tool versions; it is separate from this
runtime configuration package.

`bun run check:runtime-env` validates the application's current runtime values
without starting the service. It prints a success message or sanitized field
errors, never the parsed values.

## Optional capabilities

`AUTH_ENABLED` and `METRICS_ENABLED` accept `true`/`false` (or booleans in
programmatic input). Omitted switches are disabled by the application. Auth
requires `BETTER_AUTH_SECRET` (32–1024 characters) and `BETTER_AUTH_URL` (an
HTTP(S) origin, HTTPS in production). `DATABASE_PATH` is an optional SQLite
path; the app defaults to `./data/raypx.db` when auth is enabled. Migrations
are an explicit deployment step, `bun run db:migrate`.

Metrics require `METRICS_TOKEN` (32–1024 base64url characters: letters,
digits, hyphens, or underscores). `APP_ORIGIN` may supply
the canonical origin for write protection; otherwise auth uses its declared
base URL. Origins exclude credentials, paths, query strings, and fragments.
`API_RATE_LIMIT_MAX` and `API_RATE_LIMIT_WINDOW_MS` accept integers from 1 to
1,000,000; web defaults to 120 requests per 60,000 ms. Credentials remain in
server configuration and never enter the client export or validation output.
