import { turbo as runTurbo } from "@voidmix/devkit/process";
import { pinnedNode as findPinnedNode, readToolchain } from "@voidmix/devkit/toolchain";
import { discover as discoverWorkspaces } from "@voidmix/devkit/workspaces";

/** Raypx conventions for the shared @voidmix/devkit checks. */
export const discover = (root: string) => discoverWorkspaces(root, { metadataKey: "raypx" });

export const pinnedNode = (root: string) =>
  findPinnedNode(root, { nodeBinaryEnv: "RAYPX_NODE_BINARY" });

export function turbo(root: string, task: string, args: string[] = []): Promise<void> {
  // Remote credentials are usable only in the protected workflow; forks cannot read them.
  return runTurbo(root, task, args, {
    env: {
      RAYPX_CACHE_PLATFORM: `${process.platform}-${process.arch}-bun${process.versions.bun}-node${readToolchain(root).node}`,
    },
    trustedCacheEnv: "RAYPX_REMOTE_CACHE_TRUSTED",
  });
}
