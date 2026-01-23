import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { createJiti } from "jiti";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import * as docsConfig from "./source.config";
import type { Env } from "./src/env";

const jiti = createJiti(import.meta.url);
const { env } = await jiti.import<{ env: Env }>("./src/env.ts");

const deployPlugin = nitro({
  preset: process.env.NETLIFY ? "netlify" : undefined,
  baseURL: env.BASE_URL,
  builder: "rolldown",
});

export default defineConfig({
  base: env.BASE_URL,
  optimizeDeps: {
    exclude: ["fumadocs-mdx"],
  },
  ssr: {
    // 确保 react 和 react-dom 始终作为外部依赖
    // 这样 fumadocs-mdx 会使用外部化的 react，而不是打包自己的副本
    // external 优先级高于 noExternal，所以即使 fumadocs 在 noExternal 中，react 也不会被打包进它
    external: ["react", "react-dom"],
  },
  plugins: [
    mdx(docsConfig),
    tailwindcss(),
    tsConfigPaths(),
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
    deployPlugin,
  ],
});
