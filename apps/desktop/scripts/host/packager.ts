import { chmod, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const MYGO_VERSION = "v0.8.3";

async function writable(directory: string): Promise<void> {
  await chmod(directory, 0o755);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Unsafe packager cache symlink");
    if (entry.isDirectory()) await writable(path);
    else await chmod(path, 0o644);
  }
}

/** Keep the pinned packager from mutating the shared signed payload. */
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
  if ((await probe.exited) || metadata.Version !== MYGO_VERSION || !metadata.Dir)
    throw new Error(`The packaging adapter requires the pinned MyGo ${MYGO_VERSION} source`);
  const directory = join(desktop, ".mygo/packager", MYGO_VERSION);
  await mkdir(directory, { recursive: true });
  await writable(directory);
  await cp(join(metadata.Dir, "cmd/mygo"), directory, { recursive: true });
  await writable(directory);
  const module = (await readFile(join(metadata.Dir, "go.mod"), "utf8")).replace(
    "module github.com/egoist/mygo",
    "module github.com/egoist/mygo/cmd/raypx-packager",
  );
  await writeFile(
    join(directory, "go.mod"),
    `${module}\nrequire github.com/egoist/mygo ${MYGO_VERSION}\n`,
  );
  const sums = [
    await readFile(join(metadata.Dir, "go.sum"), "utf8"),
    await readFile(join(desktop, "go.sum"), "utf8"),
  ];
  await writeFile(
    join(directory, "go.sum"),
    [...new Set(sums.join("\n").trim().split("\n"))].sort().join("\n") + "\n",
  );
  // The prepare job already signed the immutable CLI payload. MyGo may sign only outer code.
  const resources = join(directory, "resources.go");
  let source = await readFile(resources, "utf8");
  const marker = "\tfor _, n := range list {\n\t\tent := entitlements[n.name]";
  if (!source.includes(marker)) throw new Error("MyGo nested signing boundary changed");
  source = source.replace(
    marker,
    '\tfor _, n := range list {\n if strings.HasPrefix(n.name, "bin/") { continue }\n\t\tent := entitlements[n.name]',
  );
  await writeFile(resources, source);
  const bundle = join(directory, "bundle.go");
  const bundleSource = await readFile(bundle, "utf8");
  const bundleMarker = '[]string{"--force", "--deep", "--sign", identity}';
  if (!bundleSource.includes(bundleMarker)) throw new Error("MyGo outer signing boundary changed");
  await writeFile(
    bundle,
    bundleSource.replace(bundleMarker, '[]string{"--force", "--sign", identity}'),
  );
  const windows = join(directory, "winsign.go");
  source = await readFile(windows, "utf8");
  const windowsMarker = "func signWindowsResources(c *Config, dir string, res []resource) error {";
  if (!source.includes(windowsMarker)) throw new Error("MyGo Windows signing boundary changed");
  source = source.replace(windowsMarker, windowsMarker + "\n return nil\n");
  await writeFile(windows, source);

  return directory;
}
