import { packageConfig } from "@raypx/config/vite";
import { defineConfig } from "vite-plus";

export default defineConfig(
  packageConfig(import.meta.url, { name: "hooks", test: true, react: true, dom: true }),
);
