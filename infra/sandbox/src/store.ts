import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
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
  inputVolume: z.string().nullable(),
  spaceId: z.string().min(1).max(128),
  startedAt: z.number().int().nonnegative(),
  lastActiveAt: z.number().int().nonnegative(),
  writeBytes: z.number().int().nonnegative(),
  homeBytes: z.number().int().nonnegative(),
  homeEntries: z.number().int().nonnegative(),
  stopReason: z
    .enum([
      "idle",
      "lifetime",
      "storage",
      "measurement",
      "engine",
      "transfer",
      "space-transfer",
      "network",
    ])
    .nullable(),
  networkKey: z.string().uuid().nullable().optional(),
  networkBytes: z.number().int().nonnegative().optional(),
});
export type StoredComputer = z.infer<typeof storedSchema>;
export interface ComputerStore {
  read(id: string): Promise<StoredComputer | undefined>;
  write(computer: StoredComputer): Promise<void>;
  home(id: string, revision: string): Promise<HomeArchive>;
  saveHome(id: string, revision: string, archive: HomeArchive): Promise<void>;
  all(): Promise<StoredComputer[]>;
  pruneTemporary(): Promise<void>;
  pruneHomes(id: string, revision: string | null): Promise<void>;
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
    async pruneTemporary() {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      for (const name of await readdir(directory))
        if (/^\.[a-f0-9-]{36}$/.test(name)) await unlink(join(directory, name));
    },
    async all() {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const names = (await readdir(directory)).filter((name) => /^[a-f0-9-]{36}\.json$/.test(name));
      return Promise.all(
        names.map(async (name) =>
          storedSchema.parse(JSON.parse(await readFile(join(directory, name), "utf8"))),
        ),
      );
    },
    async pruneHomes(id, revision) {
      for (const name of await readdir(directory)) {
        if (
          name.startsWith(`${id}-`) &&
          /^[a-f0-9-]{36}-[a-f0-9]{64}\.home$/.test(name) &&
          name !== `${id}-${revision}.home`
        )
          await unlink(join(directory, name));
      }
    },
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
  const reasons = {
    transfer: "COMPUTER_TRANSFER_LIMIT",
    "space-transfer": "SPACE_DAILY_TRANSFER_LIMIT",
    network: "CAPACITY_UNAVAILABLE",
  } as const;
  const unavailableReason =
    computer.stopReason && computer.stopReason in reasons
      ? reasons[computer.stopReason as keyof typeof reasons]
      : undefined;
  return providerComputerSchema.parse({
    id: computer.id,
    generation: computer.generation,
    state: computer.state,
    homeRevision: computer.homeRevision,
    ...(unavailableReason ? { unavailableReason } : {}),
  });
}
