import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "@voidmix/devkit/process";
import { pinnedNode } from "../repository.js";
import { probeApi, probeWeb } from "./node.js";

export async function smoke(root: string) {
  await probeApi(root);
  await probeWeb(root);
  await smokeCloudflare(root);
  await run(
    join(root, "apps/cli/dist", process.platform === "win32" ? "raypx.exe" : "raypx"),
    ["--version"],
    tmpdir(),
  );
  await run(process.execPath, ["run", "smoke"], join(root, "apps/cli"));
}

export async function smokeCloudflare(root: string): Promise<void> {
  await run(
    pinnedNode(root),
    [fileURLToPath(new URL("./cloudflare.ts", import.meta.url)), root],
    root,
  );
}
