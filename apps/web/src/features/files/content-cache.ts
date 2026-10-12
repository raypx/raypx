import type { ArtifactContent } from "@voidmix/agent-ui/artifacts";

export interface LoadedFileContent {
  content: ArtifactContent;
  revoke?: () => void;
}
interface Entry {
  accountId: string;
  users: number;
  controller: AbortController;
  promise: Promise<LoadedFileContent>;
  loaded?: LoadedFileContent;
  timer?: ReturnType<typeof setTimeout>;
}

/** Private, in-memory immutable-version bytes. Never persisted or dehydrated with Query. */
export function createFileContentCache(idleMs = 60_000, limit = 10) {
  const entries = new Map<string, Entry>();
  const drop = (key: string, entry: Entry) => {
    if (entries.get(key) !== entry) return;
    entries.delete(key);
    if (entry.timer) clearTimeout(entry.timer);
    entry.controller.abort();
    entry.loaded?.revoke?.();
  };
  return {
    acquire(
      accountId: string,
      versionId: string,
      load: (signal: AbortSignal) => Promise<LoadedFileContent>,
    ) {
      const key = JSON.stringify([accountId, versionId]);
      let entry = entries.get(key);
      if (!entry) {
        const controller = new AbortController();
        entry = {
          accountId,
          users: 0,
          controller,
          promise: Promise.resolve({ content: { kind: "file" } }),
        };
        const created = entry;
        entries.set(key, created);
        created.promise = load(controller.signal)
          .then((loaded) => {
            if (controller.signal.aborted || entries.get(key) !== created) {
              loaded.revoke?.();
              throw new DOMException("Aborted", "AbortError");
            }
            created.loaded = loaded;
            return loaded;
          })
          .catch((error) => {
            drop(key, created);
            throw error;
          });
        for (const [otherKey, other] of entries) {
          if (entries.size <= limit) break;
          if (other !== created && other.users === 0) drop(otherKey, other);
        }
      }
      const retained = entry;
      retained.users++;
      if (retained.timer) clearTimeout(retained.timer);
      let released = false;
      return {
        promise: retained.promise,
        release() {
          if (released) return;
          released = true;
          retained.users--;
          if (entries.get(key) !== retained) return;
          if (retained.users > 0) return;
          if (!retained.loaded) drop(key, retained);
          else retained.timer = setTimeout(() => drop(key, retained), idleMs);
        },
      };
    },
    disposeAccount(accountId: string) {
      for (const [key, entry] of entries) if (entry.accountId === accountId) drop(key, entry);
    },
  };
}
