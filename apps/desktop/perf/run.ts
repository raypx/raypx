import { dirname, resolve, join, relative } from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runPerformance } from "@raypx/tooling/performance";
import { startBrowserPreview } from "@raypx/tooling/browser-server";
import { createSeed } from "./fixture";
const root = resolve(import.meta.dirname, "../../..");
const binary = resolve(
  dirname(fileURLToPath(import.meta.resolve("@hona/strobe/package.json"))),
  "bin/strobe.js",
);
const mode = process.argv[2] ?? "native";
process.env.RAYPX_STROBE_BIN = binary;
process.env.RAYPX_STROBE_EVIDENCE = join(
  root,
  ".artifacts/performance/ownership-" + crypto.randomUUID(),
);
await mkdir(process.env.RAYPX_STROBE_EVIDENCE, { recursive: true, mode: 0o700 });
if (mode === "browser") {
  const servers = [];
  try {
    for (const variant of ["BASE", "HEAD"]) {
      const directory = process.env[`RAYPX_STROBE_${variant}_SPA`];
      if (!directory)
        throw new Error(`Set RAYPX_STROBE_${variant}_SPA to the prepared production SPA fixture`);
      const server = await startBrowserPreview({ directory: resolve(directory), port: 0 });
      servers.push(server);
      process.env[`RAYPX_STROBE_${variant}_URL`] = server.url.origin;
    }
    await runPerformance(root, binary, "apps/desktop/perf/browser.bench.ts", ["browser"]);
  } finally {
    for (const server of servers) await server.stop(true);
  }
} else {
  const targets =
    mode === "all" ? (process.platform === "win32" ? ["native", "webview"] : ["native"]) : [mode];
  const failures: string[] = [];
  for (const target of targets) {
    try {
      await runPerformance(root, binary, "apps/desktop/perf/startup.bench.ts", [target]);
    } catch (error) {
      failures.push(`${target} launch: ${error instanceof Error ? error.message : "refused"}`);
    }
    const exe = process.env.RAYPX_STROBE_HEAD_EXE;
    if (!exe) throw new Error("Missing head Desktop delivery executable");
    const seed = await createSeed(root, exe);
    try {
      process.env.RAYPX_STROBE_SEED_HOME = relative(import.meta.dirname, seed.home);
      await runPerformance(root, binary, "apps/desktop/perf/workbench.bench.ts", [target]);
      if (target === "webview")
        await runPerformance(root, binary, "apps/desktop/perf/conversation.bench.ts", [target]);
    } catch (error) {
      failures.push(`${target} workbench: ${error instanceof Error ? error.message : "refused"}`);
    } finally {
      await seed.close();
      delete process.env.RAYPX_STROBE_SEED_HOME;
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
}
