import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: { "/api/auth": "http://localhost:3002", "/rpc": "http://localhost:3002" },
  },
  build: { outDir: "dist" },
});
