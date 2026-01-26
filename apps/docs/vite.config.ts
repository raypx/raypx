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
  ssr: {
    // Bundle dependencies into output instead of treating as external
    noExternal: true,
  },
});
