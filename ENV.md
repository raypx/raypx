# Raypx Environment & Configuration

The runtime configuration contract lives in `@raypx/env/server`. Configuration
is validated during server startup, before requests are accepted. Importing the
module does not read environment variables, so building the application does
not require deployment credentials. `bun run check:env` separately checks
Node.js and Bun versions; it does not validate application configuration.
`bun run check:runtime-env` validates application configuration without starting
the server and reports only validity or sanitized field errors.

## Supported Variables

| Variable      | Purpose                                    | Default                                     | Validation                                                      |
| ------------- | ------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------- |
| `NODE_ENV`    | Runtime mode                               | `development`                               | `development`, `test`, or `production`                          |
| `HOST`        | Production listen address                  | `127.0.0.1`                                 | IPv4, IPv6, or hostname; no URL scheme or port                  |
| `PORT`        | Production listen port                     | `3000`                                      | Decimal integer between 1 and 65535                             |
| `NITRO_HOST`  | Override production listen address         | Uses `HOST`                                 | Same validation as `HOST`                                       |
| `NITRO_PORT`  | Override production listen port            | Uses `PORT`                                 | Same validation as `PORT`                                       |
| `LOG_LEVEL`   | Minimum server log level                   | Selected by the logger for the runtime mode | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, or `silent` |
| `APP_VERSION` | Release identifier in operational metadata | Omitted                                     | String of at most 128 characters                                |

Leading and trailing whitespace is trimmed. Empty or whitespace-only values
count as unset: fields with defaults use those defaults, and optional fields
are omitted. For example, `PORT=` uses `3000`; `PORT=abc`, `PORT=0`, and
`PORT=3000.5` fail validation. Configuration errors list field names and rules,
without logging supplied values. Nonblank `NITRO_HOST` and `NITRO_PORT` take
precedence over `HOST` and `PORT`. Only effective listener values are validated;
errors identify the source field. Blank Nitro overrides fall back to `HOST`
and `PORT`. The parsed result exposes those effective values as `HOST` and
`PORT`. Unsupported fields are ignored.

## Configuration Files and Startup

The application example is `apps/web/.env.example`. Copy it to `.env` in the
same directory. Local env files are excluded from Git.

```sh
cp apps/web/.env.example apps/web/.env
bun run build
bun run start
```

The production start task runs in `apps/web`; Bun loads `.env` from that
directory. Production environments may inject variables directly. Containers
should set `HOST=0.0.0.0`. The root `.env.example` points to the application
example rather than maintaining a second configuration contract.

Development listening is fixed at `127.0.0.1:5173`. `HOST` and `PORT` configure
the production listener. Restart the server after changing runtime values.
When executing the production artifact directly, set the same variables before
running `bun apps/web/.output/server/index.mjs`.

## Package APIs and Boundaries

```typescript
import { loadServerEnv, getServerEnv, parseServerEnv } from "@raypx/env/server";

// Startup: validate the process environment once.
loadServerEnv();
// Consumers reuse the same frozen configuration.
const env = getServerEnv();
// Tests and other callers can validate supplied values independently.
const testEnv = parseServerEnv({ NODE_ENV: "test", PORT: "9000" });
```

`loadServerEnv(input = process.env)` validates and stores configuration.
`getServerEnv()` returns that configuration, loading it on first use if necessary.
An invalid reload throws without replacing a previously valid configuration.
Types are inferred from the Zod schema. Runtime packages consume `env/server`,
not the engineering `config` package.

`@raypx/env/client` has no public variables yet and never reads `process.env`.
Its parser strips undeclared fields. There is no mixed root export. Start import
protection and the package boundary checker reject browser imports of
`@raypx/env/server`.

## Adding Configuration

Declare each supported server field in the server schema and wire it to its
consumer. Update this document, `apps/web/.env.example`, and validation tests
together. Provider credentials should become required only when their feature
is configured and active. `DATABASE_PATH`, `SESSION_SECRET`, OAuth, email,
Redis, and monitoring provider credentials are not part of this runtime schema.

Public browser fields must be explicitly declared in the client schema and
populated from public build inputs. `VITE_` values can enter browser artifacts;
never give credentials that prefix. Public build configuration requires a
rebuild when it changes. The health check uses same-origin `/api/health`, so it
does not require a public API base URL.
