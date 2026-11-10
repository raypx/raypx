import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  build: { outDir: "../../artifacts/performance-spa", emptyOutDir: true },
  resolve: { dedupe: ["react", "react-dom"] },
});
