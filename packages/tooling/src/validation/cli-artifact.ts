import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { run } from "@raypx/runtime-node/process";

/** Linux provider probes require a loopback-only namespace, including in full verification. */
export async function smokeCliArtifact(root: string) {
  if (process.platform !== "linux") {
    await run(process.execPath, ["run", "smoke"], join(root, "apps/cli"));
    return;
  }
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const pin = /^bun@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager);
  if (!pin) throw new Error("CLI artifact acceptance requires the pinned Bun runtime");
  const payload = process.env.RAYPX_CLI_PAYLOAD;
  const evidence = join(root, ".artifacts/cli");
  await mkdir(evidence, { recursive: true });
  await run(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "--user",
      `${process.getuid!()}:${process.getgid!()}`,
      "--mount",
      `type=bind,src=${resolve(root)},dst=/workspace,readonly`,
      "--mount",
      `type=bind,src=${resolve(evidence)},dst=/workspace/.artifacts/cli`,
      ...(payload
        ? [
            "--mount",
            `type=bind,src=${resolve(payload)},dst=/raypx-cli-payload,readonly`,
            "--env",
            "RAYPX_CLI_PAYLOAD=/raypx-cli-payload",
          ]
        : []),
      "--workdir",
      "/workspace",
      `oven/bun:${pin[1]}`,
      "bun",
      "run",
      "--cwd",
      "apps/cli",
      "smoke",
    ],
    root,
  );
}
