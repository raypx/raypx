# @raypx/env

> Forked from [@t3-oss/t3-env](https://github.com/t3-oss/t3-env) with `extends` support

Environment validation with the ability to merge multiple configurations.

## Key Features

- ✅ **Typesafe environment variables** - Full TypeScript support with autocompletion
- ✅ **Extends support** - Merge multiple environment configurations using the `extends` option
- ✅ **Runtime validation** - Validates environment variables at runtime
- ✅ **Framework agnostic** - Works with any JavaScript/TypeScript project
- ✅ **Standard Schema compliant** - Works with Zod, Valibot, and other validators

## Installation

```bash
# npm
npm install @raypx/env

# pnpm
pnpm add @raypx/env

# yarn
yarn add @raypx/env
```

## Basic Usage

```typescript
import { createEnv } from "@raypx/env";
import { z } from "zod";

const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    API_KEY: z.string().min(1),
  },
  client: {
    VITE_APP_URL: z.string().url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    API_KEY: process.env.API_KEY,
    VITE_APP_URL: process.env.VITE_APP_URL,
  },
});
```

## Extends Feature

The main enhancement in this fork is the `extends` option that allows you to merge multiple environment configurations:

```typescript
import { createEnv } from "@raypx/env";
import { z } from "zod";

// Base configuration
const baseConfig = {
  NODE_ENV: z.enum(["development", "production", "test"]),
};

// Database configuration
const dbConfig = {
  DATABASE_URL: z.string().url(),
  DB_POOL_SIZE: z.number().min(1),
};

// API configuration
const apiConfig = {
  API_BASE_URL: z.string().url(),
  API_TIMEOUT: z.number().min(1000),
};

// Merge all configurations
const env = createEnv({
  server: baseConfig,
  runtimeEnv: process.env,
  extends: [dbConfig, apiConfig],
});

// Now env has all properties from baseConfig, dbConfig, and apiConfig
console.log(env.DATABASE_URL); // ✅ Type-safe access
console.log(env.API_BASE_URL); // ✅ Type-safe access
```

## Differences from Original

This fork adds the following features to the original [@t3-oss/t3-env](https://github.com/t3-oss/t3-env):

1. **`extends` option** - Merge multiple environment configurations
2. **Deep merging** - Recursively merge nested objects
3. **Type inference** - Full TypeScript support for merged configurations
4. **Performance optimizations** - Efficient merging using `UnionToIntersection`

## Credits

- **Original work**: [T3 Stack Team](https://github.com/t3-oss/t3-env)
- **Fork maintained by**: Raypx Team
- **License**: MIT

## License

MIT License - see [original repository](https://github.com/t3-oss/t3-env) for details.
