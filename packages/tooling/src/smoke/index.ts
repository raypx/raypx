import { mkdir } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { run } from "@raypx/runtime-node/process";
import { probeApi, probeWeb } from "./artifacts";
import { readBunPin } from "../validation/toolchain.ts";

async function probeCli(root: string) {
  const payload = resolve(process.env.RAYPX_CLI_PAYLOAD ?? join(root, "apps/cli/dist"));
  await run(
    join(payload, process.platform === "win32" ? "raypx.exe" : "raypx"),
    ["--version"],
    tmpdir(),
  );
  if (
    process.platform !== "linux" ||
    Object.keys(networkInterfaces()).every((name) => name === "lo")
  ) {
    await run(process.execPath, ["run", "smoke"], join(root, "apps/cli"));
    return;
  }
  const reports = join(root, ".artifacts/cli");
  await mkdir(reports, { recursive: true });
  // Prepare on the host, then accept the same payload with no external network or inherited secrets.
  await run(
    "docker",
    [
      "run",
      "--rm",
      "--init",
      "--network",
      "none",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--read-only",
      "--tmpfs",
      "/tmp:exec,mode=1777",
      "--user",
      `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
      "--mount",
      `type=bind,src=${root},dst=/repo,readonly`,
      "--mount",
      `type=bind,src=${payload},dst=/payload,readonly`,
      "--mount",
      `type=bind,src=${reports},dst=/repo/.artifacts/cli`,
      "--env",
      "RAYPX_CLI_PAYLOAD=/payload",
      "--workdir",
      "/repo/apps/cli",
      `oven/bun:${readBunPin(root)}`,
      "bun",
      "--no-env-file",
      "run",
      "smoke",
    ],
    root,
  );
}

export async function smoke(root: string, selected: readonly string[] = ["api", "web", "cli"]) {
  const outcomes = await Promise.allSettled([
    ...(selected.includes("api") ? [probeApi(root)] : []),
    ...(selected.includes("web") ? [probeWeb(root)] : []),
    ...(selected.includes("cli") ? [probeCli(root)] : []),
  ]);
  const failed = outcomes.filter((result) => result.status === "rejected");
  if (failed.length)
    throw new AggregateError(
      failed.map((result) => result.reason),
      "Artifact verification failed",
    );
}
