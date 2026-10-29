import { execFileSync } from "node:child_process";
import { dirname, relative } from "node:path";
interface CargoPackage {
  name: string;
  manifest_path: string;
  dependencies: { name: string }[];
}

export function affectedCargo(root: string, files: string[], packages: CargoPackage[]) {
  const owners = new Map(
    packages.map((pkg) => [
      pkg.name,
      relative(root, dirname(pkg.manifest_path)).replaceAll("\\", "/"),
    ]),
  );
  const affected = new Set(
    packages
      .filter((pkg) => files.some((file) => file.startsWith(owners.get(pkg.name)! + "/")))
      .map((pkg) => pkg.name),
  );
  for (;;) {
    const count = affected.size;
    for (const pkg of packages)
      if (pkg.dependencies.some((dep) => affected.has(dep.name))) affected.add(pkg.name);
    if (count === affected.size) break;
  }
  const native = [...affected].some((name) => owners.get(name)?.endsWith("/src-tauri"));
  const selected = [...affected]
    .filter((name) => process.platform !== "linux" || !owners.get(name)?.endsWith("/src-tauri"))
    .sort();
  return { packages: selected, native };
}
export function cargoChanges(root: string, files: string[]) {
  const metadata = JSON.parse(
    execFileSync("cargo", ["metadata", "--no-deps", "--format-version", "1", "--offline"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as { packages: CargoPackage[] };
  return affectedCargo(root, files, metadata.packages);
}
