import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig, type PluginOption } from "vite";
import Inspect from "vite-plugin-inspect";
import tsConfigPaths from "vite-tsconfig-paths";
import * as MdxConfig from "./source.config";
import env from "./src/env";

const isDev = env.NODE_ENV === "development";

const deployPlugin = () => {
  const plugins: PluginOption[] = [];

  if (env.NETLIFY) {
    return [
      nitro({
        preset: "netlify",
      }),
    ];
  }

  return plugins?.length
    ? plugins
    : [
        nitro({
          preset: "node-server",
        }),
      ];
};

export default defineConfig(({ command }) => ({
  base: "/docs/",
  server: {
    port: 3004,
    open: isDev,
  },
  ssr: {
    noExternal: command === "build" ? true : undefined,
  },
  resolve: {
    external: ["fumadocs-core", "fumadocs-ui", "@fumadocs/base-ui", "@raypx/ai"],
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  plugins: [
    // Conditionally load MDX for faster startup (use SKIP_DOCS=true to skip)
    mdx(MdxConfig),
    // Always include for production tree-shaking
    devtools({
      enhancedLogs: { enabled: false },
      injectSource: { enabled: false },
    }),
    // Vite plugin inspector (dev only)
    ...(isDev ? [Inspect()] : []),
    tsConfigPaths(),
    tanstackStart(),
    // Must come after tanstackStart
    viteReact({
      // https://react.dev/learn/react-compiler
      babel: {
        plugins: [
          [
            "babel-plugin-react-compiler",
            {
              target: "19",
            },
          ],
        ],
      },
    }),
    tailwindcss(),
    deployPlugin(),
  ],
}));
