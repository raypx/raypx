import { join } from "node:path";
import fg from "fast-glob";
import fs from "fs-extra";
import { createTask, definedCmd } from "../lib/task";
import { PROJECT_ROOT } from "../utils";

async function generateUiComponentExports() {
  const COMPONENTS_DIR = join(PROJECT_ROOT, "packages/ui/src/components");
  const entries = await fg("*.{ts,tsx}", {
    cwd: COMPONENTS_DIR,
    onlyFiles: true,
    ignore: ["index.tsx"],
  });

  const components = entries
    .map((entry) => entry.replace(/\.(ts|tsx)$/, ""))
    .sort((a, b) => a.localeCompare(b));

  const exportsBlock = components.map((name) => `export * from "./${name}";`).join("\n");

  fs.writeFileSync(join(COMPONENTS_DIR, "index.ts"), `${exportsBlock}\n`);

  return {
    componentCount: components.length,
  };
}

/**
 * Post-install tasks
 */
const postinstall = definedCmd([
  createTask("biome migrate --write", "Biome migration"),
  createTask("pnpm exec lefthook install", "Lefthook"),
  createTask("Generate UI component exports", async (_, task) => {
    const result = await generateUiComponentExports();
    task.title = `Generated UI component exports (${result.componentCount})`;
  }),
]);

export default postinstall;
