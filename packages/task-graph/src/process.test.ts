import { tmpdir } from "node:os";
import { expect, it } from "vite-plus/test";
import { run } from "./process.js";

it("resolves successful commands and rejects failures", async () => {
  await expect(run(process.execPath, ["-e", ""], tmpdir())).resolves.toBeUndefined();
  await expect(run(process.execPath, ["-e", "process.exit(3)"], tmpdir())).rejects.toThrow(
    "exited 3",
  );
});
