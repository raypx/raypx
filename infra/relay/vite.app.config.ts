import { defineConfig } from "vite-plus";

export default defineConfig({
  ssr: { noExternal: true, external: ["bun"] },
  build: {
    ssr: "src/main.ts",
    target: "esnext",
    outDir: "dist",
    emptyOutDir: true,
  },
});
