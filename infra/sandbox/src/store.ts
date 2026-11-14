import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  providerComputerSchema,
  homeArchiveSchema,
  type HomeArchive,
  type ProviderComputer,
} from "@raypx/providers/computer";
const storedSchema = providerComputerSchema.extend({
  container: z.string().nullable(),
  volume: z.string().nullable(),
});
export type StoredComputer = z.infer<typeof storedSchema>;
export interface ComputerStore {
  read(id: string): Promise<StoredComputer | undefined>;
  write(computer: StoredComputer): Promise<void>;
  home(id: string, revision: string): Promise<HomeArchive>;
  saveHome(id: string, revision: string, archive: HomeArchive): Promise<void>;
}
export function diskStore(directory: string): ComputerStore {
  async function atomic(name: string, value: unknown) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.${crypto.randomUUID()}`);
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(value));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, join(directory, name));
      const parent = await open(directory, "r");
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  return {
    async read(id) {
      try {
        return storedSchema.parse(
          JSON.parse(await readFile(join(directory, `${id}.json`), "utf8")),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
    write: (computer) => atomic(`${computer.id}.json`, computer),
    async home(id, revision) {
      return homeArchiveSchema.parse(
        JSON.parse(await readFile(join(directory, `${id}-${revision}.home`), "utf8")),
      );
    },
    saveHome: (id, revision, archive) => atomic(`${id}-${revision}.home`, archive),
  };
}
export function publicComputer(computer: StoredComputer): ProviderComputer {
  return providerComputerSchema.parse({
    id: computer.id,
    generation: computer.generation,
    state: computer.state,
    homeRevision: computer.homeRevision,
  });
}
