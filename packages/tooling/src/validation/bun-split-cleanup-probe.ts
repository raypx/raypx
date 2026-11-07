// Temporary Windows handle diagnosis; removed after the owner is identified.
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { taskModel } from "../tasks/model.js";
import { removeOwnedTemporaryDirectory } from "./owned-temporary.js";
const root = resolve(import.meta.dirname, "../../../..");
const cli = taskModel(root).members.find((member) => member.name === "cli")!;
const evidence = join(root, ".artifacts/bun-split/cleanup-probe");
await mkdir(evidence, { recursive: true });
const temporary = await mkdtemp(join(evidence, "temporary-"));
const payload = join(root, cli.path, "dist");
const env = {
  ...process.env,
  TEMP: temporary,
  TMP: temporary,
  TMPDIR: temporary,
  RAYPX_CLI_PAYLOAD: payload,
  RAYPX_HERDR_COMPILED: "1",
};
for (const test of ["herdr-terminal", "artifact", "windows-payload", "launcher-lifecycle"]) {
  const child = Bun.spawn([process.execPath, join(root, cli.path, `tests/smoke/${test}.ts`)], {
    cwd: root,
    env:
      test === "herdr-terminal"
        ? { ...env, PATH: "", RAYPX_HERDR_BINARY: join(payload, "herdr/herdr.exe") }
        : env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
    timeout: 300_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  await writeFile(join(evidence, `${test}.log`), stdout + stderr);
  console.log(
    `[DEBUG-bun-split-cleanup] ${test}: ${exit}; directories: ${JSON.stringify(await readdir(temporary))}`,
  );
}
try {
  await removeOwnedTemporaryDirectory(temporary);
  console.log("[DEBUG-bun-split-cleanup] complete fixture: removed");
} catch (error) {
  console.log(`[DEBUG-bun-split-cleanup] ${String(error)}`);
}
