import { join } from "node:path";
import fg from "fast-glob";
import fs from "fs-extra";
import { PROJECT_ROOT } from "./index";

/**
 * Generates component exports for a specific package directory
 */
export async function generateComponentExports(pkgName: string): Promise<void> {
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
 * Generates component exports for all UI packages
 */
export async function generateAllComponentExports(): Promise<void> {
  const packages = ["components", "business"];
  await Promise.all(packages.map(generateComponentExports));
}
