import { verifyCliPayload } from "@raypx/tooling/build/cli";
import { cp, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

/** Stage the prepared Bun executable and Herdr without rebuilding or re-signing. */
export async function stageRuntime(source: string, target: string): Promise<void> {
  const { files: _files, ...identity } = await verifyCliPayload(source, {
    platform: process.platform,
    arch: process.arch,
    bunVersion: Bun.version,
  });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await cp(source, temporary, { recursive: true, errorOnExist: true, force: false });
    await verifyCliPayload(temporary, identity);
    await rm(target, { recursive: true, force: true });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
