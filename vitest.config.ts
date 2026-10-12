import { defineConfig } from "vite-plus/test/config";

export default defineConfig({
  test: {
    exclude: ["e2e/**", "**/node_modules/**", "**/coverage/**"],
  },
});
