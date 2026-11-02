import { defineConfig, mergeConfig } from "vite-plus/test/config";
import defaults from "../../test.config.js";

export default mergeConfig(defaults, defineConfig({ test: { include: ["src/**/*.test.ts"] } }));
