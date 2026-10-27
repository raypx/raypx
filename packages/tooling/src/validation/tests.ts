import { copyFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { discover } from "../repository.js";
import { Evidence } from "./evidence.js";
import { baselineCases, collectInventory, compareCases, ownerMap } from "./inventory.js";

export async function auditTests(root: string, args: string[], cwd = root) {
  let layers = false,
    baseline: string | undefined,
    owners: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--layers") layers = true;
    else if (
      (arg === "--baseline" || arg === "--owners") &&
      args[index + 1] &&
      !args[index + 1]!.startsWith("--")
    ) {
      const value = resolve(cwd, args[++index]!);
      if (arg === "--baseline") baseline = value;
      else owners = value;
    } else throw new Error("Usage: test inventory [--layers] [--baseline file] [--owners file]");
  }
  if (owners && !baseline) throw new Error("--owners requires --baseline");
  // Load comparison inputs before starting a new run. Never mutate a baseline.
  const before = baseline ? baselineCases(await Bun.file(baseline).json()) : undefined;
  const mapping = owners ? ownerMap(await Bun.file(owners).json()) : {};
  const evidence = new Evidence(root, "tests");
  await evidence.run(async () => {
    const reports: string[] = [];
    for (const layer of layers ? ["unit", "component", "integration"] : ["all"]) {
      const task = layer === "all" ? "test" : `test:${layer}`;
      const report = `audit-${evidence.id}-${layer}.json`;
      reports.push(report);
      await evidence.command(layer, [
        process.execPath,
        "--no-env-file",
        join(root, "packages/tooling/src/cli.ts"),
        "tasks",
        task,
        "--no-cache",
        "--",
        "--reporter=json",
        `--outputFile=node_modules/.cache/raypx-tests/${report}`,
      ]);
      for (const workspace of discover(root).workspaces) {
        if (!workspace.manifest.scripts?.[task]) continue;
        const source = join(root, workspace.path, "node_modules/.cache/raypx-tests", report);
        const file = `${encodeURIComponent(workspace.manifest.name)}-${layer}.json`;
        await copyFile(source, join(evidence.directory, file));
      }
    }
    const inventory = await collectInventory(root, reports);
    await writeFile(join(evidence.directory, "inventory.json"), JSON.stringify(inventory, null, 2));
    const difference = before ? compareCases(before, inventory.cases, mapping) : undefined;
    if (difference)
      await writeFile(
        join(evidence.directory, "comparison.json"),
        JSON.stringify(difference, null, 2),
      );
    console.log(
      `${inventory.cases.length} passed cases; ${inventory.files.length} files selected exactly once`,
    );
    if (difference?.missing.length)
      throw new Error(`${difference.missing.length} baseline cases missing; see comparison.json`);
    if (difference) console.log(`Baseline preserved; ${difference.added.length} added cases`);
  });
}
