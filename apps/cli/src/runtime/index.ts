import { localParams, type LocalMethod } from "@raypx/contracts/local";
import { ProfileStorage } from "./sqlite/index.js";
import { profilePath } from "./state/index.js";
import { LocalError } from "./errors.js";
import manifest from "../../package.json";
export function createRuntime(options: { dataDir?: string; profile?: string } = {}) {
  const directory = profilePath(options);
  const storage = new ProfileStorage(directory);
  let closed = false;
  return {
    state: { db: storage.database, directory },
    async request(method: LocalMethod, raw: unknown, _client?: string, signal?: AbortSignal) {
      signal?.throwIfAborted();
      if (closed) throw new LocalError("CLOSING", "Desktop session transport is stopping");
      localParams[method].parse(raw);
      return { version: manifest.version, protocolVersion: 1 as const, owner: "daemon" as const };
    },
    async close() {
      closed = true;
      storage.close();
    },
  };
}
export type LocalRuntime = ReturnType<typeof createRuntime>;
