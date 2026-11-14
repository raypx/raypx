import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { diskStore } from "./store.js";
const owned: string[] = [];
afterEach(async () => {
  for (const path of owned.splice(0)) await rm(path, { recursive: true, force: true });
});
it("reopens fences and homes from disk and refuses corrupt metadata without empty fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-computer-store-"));
  owned.push(directory);
  const store = diskStore(directory);
  const id = crypto.randomUUID();
  const revision = "a".repeat(64);
  const row = {
    id,
    generation: 7,
    state: "destroyed" as const,
    homeRevision: revision,
    spaceId: "fixture-space",
    startedAt: 0,
    lastActiveAt: 0,
    homeBytes: 0,
    writeBytes: 0,
    homeEntries: 0,
    stopReason: null,
    inputVolume: null,
    container: null,
    volume: null,
  };
  await store.saveHome(id, revision, {
    version: 1,
    entries: [{ path: "workspace", kind: "directory", mode: 0o755 }],
  });
  await store.write(row);
  const restarted = diskStore(directory);
  expect(await restarted.read(id)).toEqual(row);
  expect(await restarted.home(id, revision)).toMatchObject({ version: 1 });
  await writeFile(join(directory, `${id}.json`), "invalid fixture metadata");
  await expect(restarted.read(id)).rejects.toThrow(/JSON/);
  expect(await restarted.read(crypto.randomUUID())).toBeUndefined();
});
it("removes only uncommitted atomic temporaries during startup recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-computer-store-"));
  owned.push(directory);
  const temporary = join(directory, `.${crypto.randomUUID()}`);
  const retained = join(directory, "retained-note");
  await writeFile(temporary, "uncommitted fixture");
  await writeFile(retained, "retained fixture");
  await diskStore(directory).pruneTemporary();
  expect(await Bun.file(temporary).exists()).toBe(false);
  expect(await Bun.file(retained).exists()).toBe(true);
});
