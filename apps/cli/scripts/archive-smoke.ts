import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { extractArchive } from "@raypx/tooling/build/archive";
import { verifyCliPayload } from "@raypx/tooling/build/cli";
import { removeTemporaryDirectory } from "../tests/helpers/temporary";
const output = resolve(import.meta.dirname, "../../../.artifacts/distribution");
const names = (await readdir(output)).filter((name) =>
  name.endsWith(process.platform === "win32" ? ".zip" : ".tar.gz"),
);
assert.equal(names.length, 1, "Expected one CLI archive for this platform");
const archive = join(output, names[0]!);
const checksum = (await readFile(archive + ".sha256", "utf8")).split(/\s/)[0];
assert.equal(
  createHash("sha256")
    .update(await readFile(archive))
    .digest("hex"),
  checksum,
);
const directory = await mkdtemp(join(tmpdir(), "raypx 中文 # archive "));
try {
  await extractArchive(archive, directory);
  await verifyCliPayload(directory);
  const child = Bun.spawn(
    [process.execPath, resolve(import.meta.dirname, "../tests/smoke/artifact.ts")],
    {
      env: { ...process.env, RAYPX_CLI_PAYLOAD: directory },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  assert.equal(await child.exited, 0, "Final CLI archive smoke failed");
  if (process.platform === "win32") {
    const lifecycle = Bun.spawn(
      [process.execPath, resolve(import.meta.dirname, "../tests/smoke/windows-payload.ts")],
      {
        env: { ...process.env, RAYPX_CLI_PAYLOAD: directory },
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    assert.equal(await lifecycle.exited, 0, "Windows archive directory lifecycle failed");
  }
} finally {
  await removeTemporaryDirectory(directory);
}
