# @raypx/env

Typed environment validation with Zod schemas, composable presets and browser access guards.

This private workspace exports `@raypx/env`. It uses the
root Zod catalog; application presets and environment loading stay with consumers.
The package is ESM-only and supports Node and browser
builds that supply runtime values explicitly.

## Create an environment

```ts
import { createEnv, z } from "@raypx/env";

const env = createEnv({
  shared: { APP_NAME: z.string().default("Example") },
  server: { PORT: z.coerce.number().int().positive().default(3000) },
  client: { VITE_API_ORIGIN: z.url() },
  runtimeEnv: { NODE_ENV: "production", PORT: "8080", VITE_API_ORIGIN: "https://api.example.com" },
});

env.PORT; // number
```

`createEnv` defaults to `process.env` and Vite's `import.meta.env` when available.
Explicit `runtimeEnv` values override those sources. It fixes the public prefix
to `VITE_`: public schema keys must use that prefix, while server keys must not.

`defineEnv` validates supplied `runtimeEnv` values, falling back to `process.env`
when they are omitted. It does not merge `import.meta.env` and supports a custom
`clientPrefix`:

```ts
import { defineEnv, z } from "@raypx/env";

const env = defineEnv({
  isServer: false,
  clientPrefix: "PUBLIC_",
  client: { PUBLIC_ORIGIN: z.url() },
  server: { API_TOKEN: z.string() },
  runtimeEnv: { PUBLIC_ORIGIN: "https://example.com", API_TOKEN: "private" },
});

env.PUBLIC_ORIGIN;
// Reading env.API_TOKEN throws EnvError in a browser environment.
```

Both APIs detect server execution when `window` is absent or Vite's `SSR` flag is
true. Set `isServer` explicitly when the host needs another distinction.
Browser validation omits server schemas. Only declared shared keys and declared
client keys matching their preset's prefix are accessible; undeclared string
properties are rejected. `_schema` exposes the final Zod schema.

## Compose presets

```ts
import { createEnv, type Preset, z } from "@raypx/env";

const connection = {
  id: "connection",
  server: { PORT: z.string(), HOST: z.string().default("localhost") },
} as const satisfies Preset;

const numericConnection = {
  extends: [connection],
  server: { PORT: z.coerce.number().int() },
} as const satisfies Preset;

const env = createEnv({
  extends: [numericConnection],
  runtimeEnv: { PORT: "3000" },
});

env.PORT; // number, reflecting the later schema
```

Presets can declare `id`, `extends`, `shared`, `server`, `client` and
`clientPrefix`. Nested presets are visited before their parent; later presets
and the environment's own schemas override earlier keys. Runtime values and
output types follow the same order. Circular preset references throw `EnvError`.
Preset IDs are diagnostic labels and do not namespace keys.

## Validation options

Blank strings, including whitespace-only strings, become `undefined`. Defaults
apply before the final schema is parsed, and Zod transforms determine output
types. Input objects are never mutated.

| Option                     | Behavior                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------ |
| runtimeEnv                 | String, boolean, number or undefined values; createEnv merges them with host values  |
| isServer                   | Override automatic server/browser detection                                          |
| skip                       | Skip schema parsing; declared raw/default values remain available with access guards |
| transform(shape, isServer) | Supply a final Zod schema from the composed raw shape                                |
| onError(issues)            | Replace the default validation failure handler; must throw                           |
| onInvalidAccess(variable)  | Replace the default browser access failure handler; must throw                       |

```ts
import { defineEnv, z } from "@raypx/env";

const env = defineEnv({
  server: { PORT: z.string() },
  runtimeEnv: { PORT: "8080" },
  transform: () => z.object({ PORT: z.coerce.number().int() }),
});

env.PORT; // number
env._schema; // the final transformed schema
```

The default `EnvError` validation message lists failing keys and schema issue
messages. Custom Zod messages and custom callbacks are controlled by the caller;
keep secret values out of them. With `skip`, parsed output types describe the
normal validated path; runtime values may remain untransformed.

## Exports and scope

The root exports `createEnv`, `defineEnv`, `EnvError` and `z`, plus
`CreateEnvOptions`, `ClientFormat`, `DefineEnv`, `EnvOptions`, `ExtendsFormat`,
`FinalSchema`, `Preset`, `Schema`, `ServerFormat` and `SharedFormat` types.
Each consumer declares its own `NODE_ENV` schema; the package publishes no shared
runtime preset.

The library performs no `.env` loading, filesystem access or CLI work. Consumers
own environment loading, application presets and browser-safe value injection.
Access guards protect the exposed environment object; they do not remove secrets
that a consumer has explicitly embedded in its browser bundle.
