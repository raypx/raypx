import { workspaceTaskConfig } from "@raypx/tooling/tasks";
import { defineConfig } from "vite-plus";

export default defineConfig({ envPrefix: [], ...workspaceTaskConfig(import.meta.url) });
