import { createRequire } from "node:module";
import { copyFile, cp } from "node:fs/promises";
import { dirname, join } from "node:path";

const resolve = createRequire(import.meta.url).resolve;

/** Stage the upstream executable and its adjacent skills without rewriting them. */
export async function extractCli(output: string) {
  const upstream = dirname(resolve("drizzle-kit"));
  const executable = join(output, "bin.cjs");
  await copyFile(join(upstream, "bin.cjs"), executable);
  await cp(join(upstream, "skills"), join(output, "skills"), { recursive: true });
  return executable;
}
