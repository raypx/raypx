import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@raypx/runtime-node/process";
import { probeApi, probeWeb, probeRelay } from "./artifacts.ts";

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
              process.execPath,
              [join(root, "apps/cli/dist/main.mjs"), "--version"],
              tmpdir(),
            );
            await run("pnpm", ["run", "smoke"], join(root, "apps/cli"));
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
