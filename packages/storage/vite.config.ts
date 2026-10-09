import { defineConfig } from "vite-plus";
import { packageConfig } from "@raypx/config/vite";

export default defineConfig(
  packageConfig(import.meta.url, {
    name: "@raypx/storage",
    test: true,
  })
);
