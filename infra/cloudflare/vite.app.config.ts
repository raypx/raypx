import { defineConfig } from "vite-plus";

export default defineConfig({
  ssr: { noExternal: true, external: ["cloudflare:workers"] },
  build: {
    ssr: "src/index.ts",
    target: "esnext",
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      external: ["cloudflare:workers"],
      output: { entryFileNames: "index.js" },
    },
  },
});
