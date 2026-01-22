import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import * as docsConfig from "./source.config";
import { env } from "./src/env";

const deployPlugin = nitro({
  preset: process.env.NETLIFY ? "netlify" : undefined,
  baseURL: env.BASE_URL,
});

export default defineConfig({
  base: env.BASE_URL,
  build: {
    rolldownOptions: {
      external: [/@raypx\/[\w-]+/],
    },
  },
  plugins: [
    mdx(docsConfig),
    tailwindcss(),
    tsConfigPaths(),
    tanstackStart(),
    react(),
    deployPlugin,
  ],
});
