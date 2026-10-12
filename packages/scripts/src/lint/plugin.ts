import { fileURLToPath } from "node:url";
import { definePlugin } from "vite-plus/lint/plugins";
import { createBoundariesRule } from "./boundaries.ts";
import { loadArchitectureIndex } from "./runtime.ts";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
let index: ReturnType<typeof loadArchitectureIndex> | undefined;

export default definePlugin({
  meta: { name: "raypx" },
  rules: {
    boundaries: createBoundariesRule(
      () => (index ??= loadArchitectureIndex(repositoryRoot)),
      repositoryRoot,
    ),
  },
});
