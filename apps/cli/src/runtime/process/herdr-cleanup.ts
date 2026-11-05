import { sleep } from "@raypx/runtime-node/process";
import { rm } from "node:fs/promises";

/** Windows can release a terminated process's working directory asynchronously. */
export async function removeHerdrDirectory(
  path: string,
  remove = (directory: string) => rm(directory, { recursive: true, force: true }),
  wait: (milliseconds: number) => Promise<unknown> = sleep,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await remove(path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 10 || !["EBUSY", "EPERM", "ENOTEMPTY"].includes(code ?? "")) throw error;
      await wait(100 + attempt * 50);
    }
  }
}
