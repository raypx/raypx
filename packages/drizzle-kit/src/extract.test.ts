import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { extractCli } from "./extract.js";

it("copies the upstream CLI unchanged and stages only the executable and skills", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-drizzle-kit-"));
  try {
    const executable = await extractCli(directory);
    const resolve = createRequire(import.meta.url).resolve;
    const upstream = dirname(resolve("drizzle-kit"));
    const copied = await readFile(executable);
    expect(copied.equals(await readFile(join(upstream, "bin.cjs")))).toBe(true);
    expect((await readdir(directory)).sort()).toEqual(["bin.cjs", "skills"]);
    expect((await readdir(join(directory, "skills"), { recursive: true })).sort()).toEqual(
      (await readdir(join(upstream, "skills"), { recursive: true })).sort(),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
