import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import env from "./src/env";

export default defineConfig(({ command }) => {
  const isBuild = command === "build";

  return {
    server: {
      port: env.PORT,
    },
    ssr: {
      noExternal: ["@raypx/config", "@raypx/ui"],
    },
    build: {
      chunkSizeWarningLimit: 1000,
    },
    plugins: [
      devtools({
        enhancedLogs: { enabled: false },
        injectSource: { enabled: false },
      }),
      tsConfigPaths(),
      tanstackStart(),
      viteReact({
        ...(isBuild && {
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
      }),
      tailwindcss(),
    ],
  } satisfies UserConfig;
});
