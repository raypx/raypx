import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "@raypx/runtime-node/process";
import { extractCli } from "./extract.js";

const scratch = fileURLToPath(new URL("../node_modules/.cache", import.meta.url));

export async function runDrizzleKit(args: string[]) {
  // Resolve the CLI's ORM and Studio driver from this workspace under isolated installs.
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(join(scratch, "drizzle-kit-"));
  try {
    const executable = await extractCli(directory);
    return await runProcess(process.execPath, [executable, ...args], process.cwd());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
