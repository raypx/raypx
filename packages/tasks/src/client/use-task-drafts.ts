import { useMemo, useSyncExternalStore } from "react";
import { readTaskDrafts, type TaskDraft } from "../model/drafts.js";

const empty = { drafts: [] as TaskDraft[], ready: false, failed: false };
const failed = { ...empty, ready: true, failed: true };
const changed = "raypx:task-drafts";

function createDraftStore(key: string) {
  let raw: string | null | undefined;
  let snapshot = empty;
  const getSnapshot = () => {
    try {
      const next = localStorage.getItem(key);
      if (next !== raw || !snapshot.ready) {
        const drafts = readTaskDrafts(next);
        raw = next;
        snapshot = { drafts, ready: true, failed: false };
      }
      return snapshot;
    } catch {
      return failed;
    }
  };
  return {
    getSnapshot,
    subscribe: (notify: () => void) => {
      const storage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) notify();
      };
      const local = (event: Event) => {
        if ((event as CustomEvent<string>).detail === key) notify();
      };
      window.addEventListener("storage", storage);
      window.addEventListener(changed, local);
      return () => {
        window.removeEventListener("storage", storage);
        window.removeEventListener(changed, local);
      };
    },
    write: (drafts: TaskDraft[]) => {
      localStorage.setItem(key, JSON.stringify(drafts));
      window.dispatchEvent(new CustomEvent(changed, { detail: key }));
    },
  };
}

/** Device storage is an external store; SSR never reads the browser. */
export function useTaskDrafts(key: string) {
  const store = useMemo(() => createDraftStore(key), [key]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => empty);
  return { ...snapshot, write: store.write };
}
