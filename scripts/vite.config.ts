import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    name: "scripts",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
