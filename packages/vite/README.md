# @raypx/vite

Vite utilities and plugins for Raypx projects.

## Installation

```bash
pnpm add @raypx/vite
```

## Features

- **Virtual Module Plugin**: Create virtual modules for dynamic content injection
- **Conditional Plugins**: Enable/disable plugins based on conditions
- **Environment-aware Plugins**: Control plugin behavior by environment
- **Utility Functions**: Common vite helper functions

## Usage

### Virtual Module Plugin

Create virtual modules for runtime configuration:

```typescript
import { defineConfig } from "vite";
import { createVirtualModulePlugin } from "@raypx/vite/plugins";

export default defineConfig({
  plugins: [
    createVirtualModulePlugin({
      id: "runtime-config",
      content: () => {
        return `export const config = ${JSON.stringify({
          apiUrl: process.env.API_URL,
          version: "1.0.0",
        })}`;
      },
    }),
  ],
});

// Use in your code:
// import { config } from "virtual:runtime-config";
```

### Conditional Plugins

Enable plugins conditionally:

```typescript
import { conditionalPlugin } from "@raypx/vite/plugins";
import somePlugin from "some-plugin";

export default defineConfig({
  plugins: [
    conditionalPlugin(somePlugin(), process.env.ENABLE_PLUGIN === "true"),
  ],
});
```

### Environment-aware Plugins

Control plugins by environment:

```typescript
import { envPlugin } from "@raypx/vite/plugins";
import devOnlyPlugin from "dev-only-plugin";

export default defineConfig({
  plugins: [
    envPlugin(devOnlyPlugin(), {
      dev: true,
      prod: false,
    }),
  ],
});
```

### Utility Functions

```typescript
import { isDev, isProd, getPort, mergePlugins } from "@raypx/vite/utils";

// Check environment
if (isDev()) {
  console.log("Development mode");
}

// Get port
const port = getPort(3000); // Defaults to 3000

// Merge plugin arrays
const plugins = mergePlugins(
  [plugin1, plugin2],
  [plugin3],
  [plugin4, null, plugin5], // nulls are filtered out
);
```

## API Reference

### Plugins

#### `createVirtualModulePlugin(config)`

Create a virtual module plugin.

**Parameters:**
- `config.id` (string): Virtual module ID (without `virtual:` prefix)
- `config.content` (function): Content generator function

**Returns:** `PluginOption`

#### `conditionalPlugin(plugin, condition)`

Conditionally enable a plugin.

**Parameters:**
- `plugin` (PluginOption | null | undefined): Plugin to conditionally enable
- `condition` (boolean): Condition to check

**Returns:** `PluginOption | null`

#### `envPlugin(plugin, options)`

Enable plugin based on environment.

**Parameters:**
- `plugin` (PluginOption): Plugin to wrap
- `options.dev` (boolean, default: false): Enable in development
- `options.prod` (boolean, default: true): Enable in production

**Returns:** `PluginOption | null`

### Utils

#### `isDev()`

Check if running in development mode.

**Returns:** `boolean`

#### `isProd()`

Check if running in production mode.

**Returns:** `boolean`

#### `getEnv(key, fallback?)`

Get environment variable with optional fallback.

**Parameters:**
- `key` (string): Environment variable key
- `fallback` (string, optional): Fallback value

**Returns:** `string | undefined`

#### `getPort(defaultPort?)`

Get port from environment or use default.

**Parameters:**
- `defaultPort` (number, default: 3000): Default port

**Returns:** `number`

#### `mergePlugins(...pluginArrays)`

Merge multiple plugin arrays, filtering out null/undefined.

**Parameters:**
- `...pluginArrays`: Arrays of plugins to merge

**Returns:** `PluginOption[]`

## Presets

### Deployment Plugin

Automatically select deployment plugin based on environment:

```typescript
import { defineConfig } from "vite";
import { createDeployPlugin } from "@raypx/vite/presets";
import { nitro } from "nitro/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";

export default defineConfig({
  plugins: [
    createDeployPlugin({
      vercel: () => nitro(),
      netlify: () => netlify(),
    }),
  ],
});
```

### React Plugin with Compiler

Configure React plugin with React Compiler:

```typescript
import { defineConfig } from "vite";
import { createReactPlugin } from "@raypx/vite/presets";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    createReactPlugin(viteReact, {
      compiler: { target: "19" },
    }),
  ],
});
```

### Devtools Plugin

Configure TanStack DevTools:

```typescript
import { defineConfig } from "vite";
import { createDevtoolsPlugin } from "@raypx/vite/presets";
import { devtools } from "@tanstack/devtools-vite";

export default defineConfig({
  plugins: [
    createDevtoolsPlugin(devtools, {
      enhancedLogs: false,
      injectSource: false,
    }),
  ],
});
```

### Inspect Plugin (Dev Only)

Add Vite plugin inspector for development:

```typescript
import { defineConfig } from "vite";
import { createInspectPlugin } from "@raypx/vite/presets";
import Inspect from "vite-plugin-inspect";

export default defineConfig({
  plugins: [
    createInspectPlugin(Inspect), // Only enabled in development
  ],
});
```

### TanStack Start Preset

Complete preset for TanStack Start applications:

```typescript
import { defineConfig } from "vite";
import { createTanstackStartPreset } from "@raypx/vite/presets";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import Inspect from "vite-plugin-inspect";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    ...createTanstackStartPreset({
      react: viteReact,
      devtools,
      inspect: Inspect,
      tsConfigPaths,
      reactOptions: { compiler: { target: "19" } },
    }),
    tanstackStart(),
    tailwindcss(),
  ],
});
```

## Examples

### Complete Example

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {
  createVirtualModulePlugin,
  envPlugin,
  conditionalPlugin,
} from "@raypx/vite/plugins";
import { mergePlugins } from "@raypx/vite/utils";

export default defineConfig({
  plugins: mergePlugins(
    // Always enabled
    [react()],

    // Development only
    [
      envPlugin(
        someDevPlugin(),
        { dev: true, prod: false },
      ),
    ],

    // Conditional
    [
      conditionalPlugin(
        someConditionalPlugin(),
        process.env.FEATURE_FLAG === "true",
      ),
    ],

    // Virtual module
    [
      createVirtualModulePlugin({
        id: "app-config",
        content: () => {
          return `export default ${JSON.stringify({
            name: "My App",
            version: "1.0.0",
          })}`;
        },
      }),
    ],
  ),
});
```

## License

MIT

