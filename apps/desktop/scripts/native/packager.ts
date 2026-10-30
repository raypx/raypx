import { chmod, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

async function writable(directory: string): Promise<void> {
  await chmod(directory, 0o755);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Unsafe packager cache symlink");
    if (entry.isDirectory()) await writable(path);
    else await chmod(path, 0o644);
  }
}

/** MyGo signs nested code before sealing/archiving it. Refresh checksums at that boundary. */
export async function preparePackager(environment: NodeJS.ProcessEnv): Promise<string> {
  const desktop = resolve(import.meta.dirname, "../..");
  // `go list -m` has no Dir in a fresh module cache. Materialize and verify the
  // selected module before copying its pinned packaging sources.
  const probe = Bun.spawn(["go", "mod", "download", "-json", "github.com/egoist/mygo"], {
    cwd: desktop,
    env: environment,
    stdout: "pipe",
    stderr: "inherit",
  });
  const metadata = JSON.parse(await new Response(probe.stdout).text());
  if ((await probe.exited) || metadata.Version !== "v0.7.3" || !metadata.Dir)
    throw new Error("The packaging adapter requires the pinned MyGo v0.7.3 source");
  const directory = join(desktop, ".mygo/packager");
  await mkdir(directory, { recursive: true });
  await writable(directory);
  await cp(join(metadata.Dir, "cmd/mygo"), directory, { recursive: true });
  await writable(directory);
  const module = (await readFile(join(metadata.Dir, "go.mod"), "utf8")).replace(
    "module github.com/egoist/mygo",
    "module github.com/egoist/mygo/cmd/raypx-packager",
  );
  await writeFile(join(directory, "go.mod"), `${module}\nrequire github.com/egoist/mygo v0.7.3\n`);
  const sums = [
    await readFile(join(metadata.Dir, "go.sum"), "utf8"),
    await readFile(join(desktop, "go.sum"), "utf8"),
  ];
  await writeFile(
    join(directory, "go.sum"),
    [...new Set(sums.join("\n").trim().split("\n"))].sort().join("\n") + "\n",
  );
  for (const file of ["bundle.go", "winsign.go"]) {
    const original = join(metadata.Dir, "cmd/mygo", file);
    let source = await readFile(original, "utf8");
    if (file === "bundle.go") {
      const before =
        "\tif err := signNestedCode(c, path, identity, production); err != nil {\n\t\treturn err\n\t}";
      if (!source.includes(before)) throw new Error("MyGo macOS signing boundary changed");
      source = source.replace(
        "import (",
        'import (\n "crypto/sha256"\n "encoding/hex"\n "encoding/json"',
      );
      source = source.replace(
        before,
        `${before}\n if err := raypxRefreshHerdr(filepath.Join(path, "Contents", "Resources")); err != nil { return err }`,
      );
      source += await readFile(join(import.meta.dirname, "packager-herdr.go.txt"), "utf8");
    } else {
      const start = source.indexOf("func signWindowsResources(");
      const end = source.indexOf("\n}\n", start);
      if (start < 0 || end < 0) throw new Error("MyGo Windows signing boundary changed");
      const body = source.slice(start, end);
      const last = body.lastIndexOf("\treturn nil");
      if (last < 0) throw new Error("MyGo Windows signing boundary changed");
      source =
        source.slice(0, start + last) +
        "\treturn raypxRefreshHerdr(dir)" +
        source.slice(start + last + "\treturn nil".length);
    }
    const target = join(directory, file);
    await chmod(target, 0o644);
    await writeFile(target, source);
  }
  return directory;
}
