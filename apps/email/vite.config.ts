import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { createJiti } from "jiti";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const jiti = createJiti(import.meta.url);

// Environment variables
await jiti.import<typeof import("./src/env").default>("./src/env", { default: true });

/**
 * Vite configuration for email preview application
 * This is a dev-only TanStack Start app, not deployed to production
 */
export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tanstackStart({
      router: { routesDirectory: "app" },
    }),
    // Must come after tanstackStart
    viteReact({
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]],
      },
    }),
    tailwindcss(),
  ],
  server: {
    port: 3002,
    strictPort: false,
  },
});
