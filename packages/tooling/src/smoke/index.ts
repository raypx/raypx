import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@raypx-kit/devkit/process";
import { probeApi, probeWeb } from "./artifacts.js";

export async function smoke(root: string) {
  await probeApi(root);
  await probeWeb(root);
  await run(
    join(root, "apps/cli/dist", process.platform === "win32" ? "raypx.exe" : "raypx"),
    ["--version"],
    tmpdir(),
  );
  await run(process.execPath, ["run", "smoke"], join(root, "apps/cli"));
}
