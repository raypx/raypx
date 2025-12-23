import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type PluginOption } from "vite";
import Inspect from "vite-plugin-inspect";
import tsConfigPaths from "vite-tsconfig-paths";
import env from "./src/env";

const isDev = env.NODE_ENV === "development";

const deployPlugin = () => {
  const plugins: PluginOption[] = [];

  return plugins?.length ? plugins : [nitro()];
};

export default defineConfig({
  server: {
    port: env.PORT,
  },
  ssr: {
    noExternal: ["@tabler/icons-react"],
  },
  build: {
    // Use 'hidden' sourcemap: generates .map files but doesn't expose them to browsers
    // Access to .map files can be restricted via server config (nginx/reverse proxy)
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 1000,
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
  plugins: [
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
});
