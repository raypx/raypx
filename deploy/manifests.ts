import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readWorkspaces } from "./workspaces.ts";

// Build context metadata follows workspace discovery; no package-name allowlist.
const [root, destination] = process.argv.slice(2);
if (!root || !destination) throw new Error("Expected source and destination directories");
const files = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ...[...readWorkspaces(root).values()].map((member) => join(member.path, "package.json")),
];
for (const file of files) {
  const target = join(destination, file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(root, file), target);
  if (!file.endsWith("package.json")) continue;
  // pnpm links workspace bins only when their targets exist. Empty placeholders keep
  // the dependency layer source-free; the later source copy replaces them in place.
  const { bin } = JSON.parse(readFileSync(join(root, file), "utf8"));
  for (const entry of typeof bin === "string" ? [bin] : Object.values(bin ?? {})) {
    if (typeof entry !== "string") continue;
    const placeholder = join(dirname(target), entry);
    mkdirSync(dirname(placeholder), { recursive: true });
    if (!existsSync(placeholder)) writeFileSync(placeholder, "", { mode: 0o755 });
  }
}
