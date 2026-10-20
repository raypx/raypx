import { execFileSync } from "node:child_process";
import { turbo as runTurbo } from "@raypx-kit/devkit/process";
import { pinnedNode as findPinnedNode, readToolchain } from "@raypx-kit/devkit/toolchain";
import { discover as discoverWorkspaces } from "@raypx-kit/devkit/workspaces";

/** Raypx conventions for the shared @raypx-kit/devkit checks. */
export const discover = (root: string) => discoverWorkspaces(root, { metadataKey: "raypx" });

export const pinnedNode = (root: string) => findPinnedNode(root, { nodeBinaryEnv: "NODE_BINARY" });

export function turbo(root: string, task: string, args: string[] = []): Promise<void> {
  // Resolve Node before Bun's --bun Turbo runner adds its node shim to PATH.
  const nodeEnvironment =
    task === "e2e" || task === "test:cloudflare:postgres"
      ? {
          NODE_BINARY: execFileSync(pinnedNode(root), ["-p", "process.execPath"], {
            encoding: "utf8",
            stdio: "pipe",
          }).trim(),
        }
      : {};
  // Remote credentials are usable only in the protected workflow; forks cannot read them.
  return runTurbo(root, task, args, {
    env: {
      ...nodeEnvironment,
      RAYPX_CACHE_PLATFORM: `${process.platform}-${process.arch}-bun${process.versions.bun}-node${readToolchain(root).node}`,
    },
    developmentTasks: ["dev", "build", "build:cloudflare", "desktop#dev", "desktop#build"],
    trustedCacheEnv: "RAYPX_REMOTE_CACHE_TRUSTED",
  });
}
