import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Chunk splitting rules configuration
const chunkRules = [
  // TanStack ecosystem
  { pattern: "@tanstack/react-router", chunk: "tanstack-router" },
  { pattern: "@tanstack/react-query", chunk: "tanstack-query" },
  { pattern: "@tanstack/react-start", chunk: "tanstack-start" },
  { pattern: "@tanstack/react-form", chunk: "tanstack-forms" },

  // UI and animation libraries
  { pattern: "@radix-ui", chunk: "radix-ui" },
  { pattern: "lucide-react", chunk: "icons" },
  { pattern: /motion|embla-carousel/, chunk: "motion" },

  // Utility libraries
  { pattern: /clsx|tailwind-merge|class-variance-authority/, chunk: "utils-core" },
  { pattern: /zod|cookie-es|redaxios/, chunk: "utils-data" },

  // Analytics and development tools
  { pattern: /posthog-js|@c15t\/react/, chunk: "analytics" },
  { pattern: /@tanstack\/.*-devtools/, chunk: "dev-tools" },
];

// Chunk splitting function
function createChunkSplitter() {
  return (id: string) => {
    // Skip React libraries if externalized
    if (id.includes("react") || id.includes("react-dom")) return undefined;

    // Apply chunking rules
    for (const rule of chunkRules) {
      if (typeof rule.pattern === "string" ? id.includes(rule.pattern) : rule.pattern.test(id)) {
        return rule.chunk;
      }
    }

    // Other node_modules packages
    return id.includes("node_modules") ? "vendor" : undefined;
  };
}

const config = defineConfig({
  server: {
    port: 3000,
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: createChunkSplitter(),
      },
    },
  },
  plugins: [
    mdx(await import("./source.config")),
    devtools({
      enhancedLogs: {
        enabled: false,
      },
      injectSource: {
        enabled: false,
      },
    }),
    tsConfigPaths(),
    nitro(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
