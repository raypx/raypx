import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { productionWorkspaces, readWorkspaces } from "./workspaces.ts";

const [root, destination, entry] = process.argv.slice(2);
if (!root || !destination || !entry || process.argv.length !== 5)
  throw new Error("Usage: tsx deploy/sources.ts <source> <destination> <workspace>");

for (const member of productionWorkspaces(readWorkspaces(root), entry)) {
  const source = join(root, member.path);
  const target = join(destination, member.path);
  mkdirSync(target, { recursive: true });
  copyFileSync(join(source, "package.json"), join(target, "package.json"));
  cpSync(join(source, "src"), join(target, "src"), { recursive: true });
}
