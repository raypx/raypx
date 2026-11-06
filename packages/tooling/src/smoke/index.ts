import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@raypx/runtime-node/process";
import { probeApi, probeWeb, probeRelay } from "./artifacts";
import { smokeCliArtifact } from "../validation/cli-artifact";

export async function smoke(
  root: string,
  selected: readonly string[] = ["api", "web", "relay", "cli"],
) {
  const outcomes = await Promise.allSettled([
    ...(selected.includes("api") ? [probeApi(root)] : []),
    ...(selected.includes("web") ? [probeWeb(root)] : []),
    ...(selected.includes("relay") ? [probeRelay(root)] : []),
    ...(selected.includes("cli")
      ? [
          (async () => {
            await run(
              join(
                process.env.RAYPX_CLI_PAYLOAD ?? join(root, "apps/cli/dist"),
                process.platform === "win32" ? "raypx.exe" : "raypx",
              ),
              ["--version"],
              tmpdir(),
            );
            await smokeCliArtifact(root);
          })(),
        ]
      : []),
  ]);
  const failed = outcomes.filter((result) => result.status === "rejected");
  if (failed.length)
    throw new AggregateError(
      failed.map((result) => result.reason),
      "Artifact verification failed",
    );
}
