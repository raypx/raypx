# Raypx Environment & Configuration

Environment examples are unified in `apps/web/.env.example`. Copy to `.env` in the same directory to configure production listening.
`.env` and environment-specific local files are not committed to Git. Current runtime requires no model keys, database, or authentication configuration.

## Supported Variables

| Variable | Purpose                              | Default/Example                              |
| -------- | ------------------------------------ | -------------------------------------------- |
| `HOST`   | Production listen address for Nitro  | Example `127.0.0.1`; containers use `0.0.0.0` |
| `PORT`   | Production listen port               | Default `3000`                               |

```sh
cp apps/web/.env.example apps/web/.env
bun run build
bun run start
```

Production start task executes in `apps/web` directory, Bun loads `.env` from the same directory and runs the server artifact.
Deployment can also inject variables through the runtime environment. Development server is fixed at `127.0.0.1:5173`,
`PORT` in `.env` does not adjust development port.

## Package Boundaries

`@raypx/env/client` and `@raypx/env/server` are currently empty module entrypoints, not yet implementing variable parsing,
defaults, or configuration validation. They are reserved for future environment-specific centralized configuration, not representing existing model, database, or login configuration.

When adding business configuration:

- Public browser configuration goes to client entrypoint, only includes values visible to all visitors.
- Server configuration goes to server entrypoint, model credentials, database addresses, authentication keys, and storage credentials are only read server-side.
- Synchronously update web `.env.example` and this document, clarifying required fields, defaults, and read timing.
- Add parsing and validation according to selected capabilities, do not output key values in errors.

Browser code cannot import `env/server`, Start import protection and engineering boundary checks enforce this constraint.
Do not export both client and server configuration through a mixed root entrypoint.

## Client-Visible Configuration

Vite's `VITE_` prefixed variables enter browser artifacts. API keys, tokens, and database passwords cannot use this prefix.
Public configuration is typically read at build time; changing deployment environment does not automatically update already-built browser artifacts.
Current project has no `VITE_APP_NAME`, `VITE_API_BASE_URL`, or analytics toggle implementations.
Health check uses same-origin `/api/health`, no need for development proxy or separate API address.

## Future Capabilities

Model, database, authentication, logging, and storage providers are not yet determined, so corresponding environment variables are not yet defined.
After implementation, they will be used by `ai`, `db`, `auth`, `logger`, `storage` from `env/server` configuration.
This iteration does not install SDKs, database connectors, or authentication libraries, nor require deployment account configuration.

## Troubleshooting Variables Not Taking Effect

First confirm the variable is read by current implementation, and check if configuration location is `apps/web/.env` with correct name.
After modifying production listen configuration, restart `bun run start`; after modifying future browser build configuration, rebuild.
When injecting variables through deployment platform, check environment configuration of corresponding service, do not write sensitive values to pages, logs, or commit records.
