# @voidmix/shared

## Purpose

Foundation APIs shared by domain, adapter, application, and tooling workspaces.
This is the deepest common workspace in the repository.

## Interface

| Path              | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `.`               | Domain errors, setting value types, and injectable clock/ID defaults |
| `./env`           | Environment preset composition and validation                        |
| `./env/runtime`   | Base `NODE_ENV` preset                                               |
| `./logger`        | Evlog configuration, lifecycle functions, and event types            |
| `./logger/client` | Browser logger initialization and client logging                     |
| `./logger/env`    | Logger environment preset                                            |
| `./logger/hono`   | Hono middleware adapter                                              |
| `./logger/orpc`   | oRPC middleware and context adapter                                  |
| `./logger/vite`   | Vite client plugin integration                                       |

## Ownership

- Own the generic `DomainError` envelope used by framework-independent business
  rules, including primitive interpolation values.
- Own setting source/mutation value types and the injectable `Clock` and
  `IdGenerator` defaults used by deterministic domain and adapter code.
- Keep domain errors and primitive types independent from authentication,
  persistence, transport, and UI dependencies.
- Environment composition validates supplied values; it never reads `.env`
  files. Applications compose and validate their own environments.
- Browser environment access must reject undeclared and server-only fields.
- Operational logging owns one central sensitive-field redaction policy. Keep
  operational logs separate from durable audit records.
- Cloud callers log only operation metadata. Prompts, file content and signed
  transfer URL fields join credentials in the central redaction policy; raw
  provider exceptions must be converted to safe error codes before logging.
- Keep browser logging isolated from server adapters. Hono, oRPC, and Vite are
  optional peer dependencies, and adapters use only their explicit subpaths.
- Build public imports to ESM and declaration files in `dist/`; keep source
  checks and tests against `src/`.

## Constraints

- Runtime dependencies are limited to Zod for environment validation and Evlog
  for operational logging. Adapter dependencies remain optional peers.
- Keep this package below domain, adapter, and application workspaces in the
  dependency graph. It does not import React, Drizzle, or application behavior.
- Consumers inject `now` and `id` functions in tests and use the defaults only
  at composition boundaries.
- `DomainError` carries a stable code and optional primitive values; human
  messages remain diagnostics and are not a localization source.

## Verification

```bash
bun run vmx tasks build --filter @voidmix/shared
bun run --cwd packages/shared check
bun run --cwd packages/shared test
```
