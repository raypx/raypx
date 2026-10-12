import { defineConfig } from "nitro";
import { fileURLToPath } from "node:url";

export default defineConfig({
  compatibilityDate: "2026-08-23",
  preset: "bun",
  entry: "./src/main.ts",
  serverDir: false,
  serverEntry: false,
  noPublicDir: true,
  sourcemap: true,
  // These packages read runtime assets relative to their own modules.
  traceDeps: [
    "@earendil-works/pi-coding-agent*",
    "@earendil-works/pi-ai*",
    "pdfkit*",
    "exceljs*",
    "pptxgenjs*",
  ],
  rolldownConfig: {
    input: {
      index: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
      runner: fileURLToPath(new URL("./src/runner-main.ts", import.meta.url)),
    },
    output: {
      entryFileNames: "[name].mjs",
      // Both entrypoints and shared modules resolve the isolated runner as a sibling.
      chunkFileNames: "[name]-[hash].mjs",
    },
  },
});
