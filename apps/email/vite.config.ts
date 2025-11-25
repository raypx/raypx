import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import env from "./src/env";
import { emailPlugin } from "./src/plugins/templates-hmr";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Vite configuration for email preview application
 * This is a dev-only TanStack Start app, not deployed to production
 */
export default defineConfig({
  resolve: {
    alias: {
      // Alias for email templates directory to use in import.meta.glob
      // This allows us to use a cleaner path instead of relative paths
      "@raypx/email/emails": resolve(__dirname, "../../packages/email/src/emails"),
    },
  },
  plugins: [
    tsConfigPaths(),
    emailPlugin(), // HMR support for email templates
    tanstackStart(),
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
  server: {
    port: env.PORT || 3002,
  },
});
