import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: nitro({ preset: "node-server" }),
  server: { port: 3002, strictPort: true },
});
