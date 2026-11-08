import { expect, it } from "vite-plus/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSmokeBinary } from "../../native/smoke/launch.ts";

it("rejects a zero exit without the native smoke feature receipt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-smoke-probe-test-"));
  try {
    const windows = process.platform === "win32";
    const binary = join(directory, windows ? "probe.cmd" : "probe");
    await writeFile(binary, windows ? "@exit /b 0\r\n" : "#!/bin/sh\nexit 0\n", {
      mode: 0o700,
    });
    await expect(assertSmokeBinary(binary, process.env)).rejects.toThrow(
      "did not attest the smoke feature (0; receipt missing)",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
