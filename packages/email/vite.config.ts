import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { createJiti } from "jiti";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const jiti = createJiti(import.meta.url);

// Environment variables
await jiti.import<typeof import("./preview/env").default>("./preview/env", { default: true });

/**
 * Vite configuration for email preview application
 * This is a dev-only TanStack Start app, not deployed to production
 */
export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tanstackStart({
      router: { routesDirectory: "app" },
      srcDirectory: "./preview",
    }),
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
  ],
  root: __dirname,
  server: {
    port: 3002,
    strictPort: false,
  },
});
