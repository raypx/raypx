import netlify from "@netlify/vite-plugin-tanstack-start";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { createJiti } from "jiti";
import { nitro } from "nitro/vite";
import { defineConfig, type PluginOption } from "vite";
import Inspect from "vite-plugin-inspect";
import tsConfigPaths from "vite-tsconfig-paths";
import * as MdxConfig from "./source.config";

const jiti = createJiti(import.meta.url);

// Environment variables
const env = await jiti.import<typeof import("./src/env").default>("./src/env", {
  default: true,
  try: false,
});

const isDev = env.NODE_ENV === "development";

const deployPlugin = () => {
  const plugins: PluginOption[] = [];

  if (process.env.NETLIFY) {
    return [netlify()];
  }

  if (process.env.VERCEL || env.VERCEL) {
    return [nitro()];
  }

  return plugins;
};

export default defineConfig({
  server: {
    port: 3004,
    open: isDev,
  },
  ssr: {
    noExternal: ["@raypx/auth"],
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
    // Use nitro for dev + Vercel, netlify for other platforms
    deployPlugin(),
  ],
});
