# @raypx/env

## Purpose

A standalone environment validation library using consumer-owned Zod schemas.
Applications own variables and runtime values; this package owns composition,
validation and browser access rules.

## Interface

| Path        | Purpose                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| `.`         | `createEnv`, `defineEnv`, `EnvError`, Zod and public schema/preset types |
| `./runtime` | Reusable `NODE_ENV` preset                                               |

Public entries live directly under `src/` through the workspace exports. The README documents the complete API.

## Ownership

- Compose nested presets with later schemas overriding earlier ones in both
  runtime behavior and TypeScript inference.
- Normalize blank strings without mutating supplied values, then apply defaults
  and validate the final schema.
- Expose the final schema through `_schema` and retain configurable transforms
  and error hooks.
- Browser environments include declared shared and public variables and reject
  access to undeclared or server-only string properties.
- Keep Zod as a direct runtime dependency so the workspace resolves one compatible
  runtime for schemas and consumers.

## Constraints

- Do not import other Raypx product packages, product variables or Bun APIs.
- Do not load `.env` files, add CLI commands or perform filesystem operations.
- `createEnv` uses `VITE_` as its public prefix; `defineEnv` allows a custom prefix.
- Preserve explicit `runtimeEnv`, `isServer`, validation skip and callback behavior.
- Applications own their environment loading, client value injection and secrets.
- Keep tests beside their source; workspace consumers use the public exports.
- Widen the Zod version only after the runtime and type compatibility checks pass.

## Verification

```bash
bun run --cwd packages/env test
bun run --cwd packages/env check
```
