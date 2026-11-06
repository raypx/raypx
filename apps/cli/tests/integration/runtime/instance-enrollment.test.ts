import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { enrollTestProfile } from "../../helpers/instance.ts";

it("reports the enrollment subprocess exit and safe code without its private error text", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "raypx-enrollment-failure-"));
  try {
    await expect(
      enrollTestProfile({ dataDir }, [
        process.execPath,
        "--eval",
        'console.error(JSON.stringify({ code: "PROFILE_STORAGE_UNAVAILABLE", message: "private profile path and credential" })); process.exitCode = 7;',
        "--",
      ]),
    ).rejects.toThrow(
      "Test instance enrollment failed (exit 7; PROFILE_STORAGE_UNAVAILABLE; before begin; not-started; unknown-slot)",
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
