import { workspaceTaskConfig } from "@raypx/task-graph";
import { defineConfig } from "vite-plus";

export default defineConfig({ envPrefix: [], ...workspaceTaskConfig(import.meta.url) });
