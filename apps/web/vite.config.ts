import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type PluginOption, type UserConfig } from "vite";
import inspect from "vite-plugin-inspect";
import tsConfigPaths from "vite-tsconfig-paths";
import env from "./src/env";

const deployPlugin = () => {
  const plugins: PluginOption[] = [];

  return plugins?.length ? plugins : [nitro()];
};

export default defineConfig(({ command }) => {
  const isBuild = command === "build";

  const plugins: PluginOption[] = [
    // Always include for production tree-shaking
    devtools({
      // enhancedLogs: { enabled: false },
      // injectSource: { enabled: false },
    }),
    // Vite plugin inspector (dev only)
    ...(isBuild ? [inspect()] : []),
    tsConfigPaths(),
    tanstackStart(),
    // Must come after tanstackStart
    viteReact({
      // https://react.dev/learn/react-compiler
      // Only enable React Compiler during build for faster dev startup
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
    deployPlugin(),
  ];

  const config: UserConfig = {
    server: {
      port: env.PORT,
    },
    ssr: {
      noExternal: ["@tabler/icons-react"],
    },
    build: {
      chunkSizeWarningLimit: 1000,
    },
    plugins,
  };

  return config;
});
