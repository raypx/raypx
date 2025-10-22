import { join } from "node:path";
import fg from "fast-glob";
import fs from "fs-extra";
import { createTask, definedCmd } from "../lib/task";
import { PROJECT_ROOT } from "../utils";

async function generateComponentExports(pkgName: string) {
  const componentsDir = join(PROJECT_ROOT, `packages/ui/src/${pkgName}`);
  const fileName = "index.tsx";
  const filePath = join(componentsDir, fileName);

  const entries = await fg("*.tsx", {
    cwd: componentsDir,
    onlyFiles: true,
    ignore: [fileName],
  });

  if (entries.length === 0) return;

  const exportsBlock = entries
    .map((entry) => entry.replace(/\.tsx$/, ""))
    .sort()
    .map((name) => `export * from "./${name}";`)
    .join("\n");

  const content = `${exportsBlock}\n`;
  const existingContent = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (existingContent === content) return;

  await fs.outputFile(filePath, content, "utf-8");
}

/**
 * Post-install tasks
 */
const postinstall = definedCmd({
  tasks: [
    createTask("biome migrate --write", "Biome migration"),
    createTask("pnpm exec lefthook install", "Lefthook"),
    createTask("Generate UI component exports", async (_, task) => {
      await generateComponentExports("components");
      await generateComponentExports("business");
      task.title = `Generated UI component exports successfully`;
    }),
  ],
  type: "task",
});

export default postinstall;
