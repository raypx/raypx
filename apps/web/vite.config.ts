import * as dotenv from "@dotenvx/dotenvx";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { env } from "./src/env";

dotenv.config();

console.log("env", env);

export default defineConfig({
  ssr: {
    noExternal: ["@tabler/icons-react"],
  },
  optimizeDeps: {
    exclude: ["@raypx/ui"],
  },
  plugins: [
    tsconfigPaths(),
    tanstackStart(),
    viteReact({
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
    nitro(),
  ],
});
