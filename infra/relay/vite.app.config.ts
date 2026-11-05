import { defineConfig } from "vite-plus";

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: "src/main.ts",
    target: "esnext",
    outDir: "dist",
    emptyOutDir: true,
  },
});
