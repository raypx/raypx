import netlify from "@netlify/vite-plugin-tanstack-start";
import raypx from "@raypx/core/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type PluginOption } from "vite";
import Inspect from "vite-plugin-inspect";
import tsConfigPaths from "vite-tsconfig-paths";
import raypxConfig from "./raypx.config";
import env from "./src/env";

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
    port: env.PORT,
  },
  build: {
    chunkSizeWarningLimit: 1000,
    commonjsOptions: {
      include: [/officeparser/, /node_modules/],
    },
  },
  optimizeDeps: {
    exclude: ["officeparser"], // Exclude from client-side optimization
  },
  ssr: {
    // officeparser is a CommonJS module used server-side only
    // Mark as external so it's not bundled, loaded at runtime instead
    external: ["officeparser"],
  },
  plugins: [
    raypx(raypxConfig),
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
