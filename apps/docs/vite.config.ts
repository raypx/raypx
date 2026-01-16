import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import * as docsConfig from "./source.config";

const deployPlugin = nitro({
  preset: process.env.NETLIFY ? "netlify" : undefined,
  // baseURL: '/docs',
  apiBaseURL: '/docs',
});

export default defineConfig({
  build: {
    assetsDir: 'docs/assets'
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
