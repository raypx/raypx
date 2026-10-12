import { createStore } from "zustand/vanilla";
export interface DirectoryNotice {
  refreshFailed?: boolean;
  code:
    | "userStatusChanged"
    | "userUpdateFailed"
    | "ownerCannotChange"
    | "selectedAlready"
    | "usersUpdated"
    | "usersPartiallyUpdated"
    | "noUsersToExport"
    | "usersExported"
    | "directoryLoadFailed";
  values?: Record<string, string | number>;
}
export interface DirectoryState {
  selectedIds: ReadonlySet<string>;
  pendingIds: ReadonlySet<string>;
  notice: DirectoryNotice | null;
  select(id: string, selected: boolean): void;
  selectAll(ids: readonly string[]): void;
  setNotice(notice: DirectoryNotice | null): void;
  resetSelection(): void;
  begin(ids: readonly string[]): number | null;
  finish(token: number, ids: readonly string[], notice: DirectoryNotice): boolean;
  isCurrent(token: number): boolean;
  activate(): void;
  dispose(): void;
}
export function createDirectoryStore() {
  let active = true;
  let generation = 0;
  return createStore<DirectoryState>()((set, get) => ({
    selectedIds: new Set(),
    pendingIds: new Set(),
    notice: null,
    select: (id, selected) =>
      set((state) => {
        const ids = new Set(state.selectedIds);
        if (selected) ids.add(id);
        else ids.delete(id);
        return { selectedIds: ids };
      }),
    selectAll: (ids) => set({ selectedIds: new Set(ids) }),
    setNotice: (notice) => {
      if (active) set({ notice });
    },
    resetSelection: () => {
      generation++;
      set({ selectedIds: new Set(), notice: null });
    },
    begin: (ids) => {
      if (!active || ids.some((id) => get().pendingIds.has(id))) return null;
      set((state) => ({ pendingIds: new Set([...state.pendingIds, ...ids]), notice: null }));
      return generation;
    },
    finish: (token, ids, notice) => {
      if (!active) return false;
      const current = token === generation;
      set((state) => {
        const pending = new Set(state.pendingIds);
        for (const id of ids) pending.delete(id);
        return {
          pendingIds: pending,
          ...(current ? { notice, selectedIds: new Set<string>() } : {}),
        };
      });
      return current;
    },
    isCurrent: (token) => active && token === generation,
    activate: () => {
      active = true;
    },
    dispose: () => {
      active = false;
      generation++;
    },
  }));
}
export type DirectoryStore = ReturnType<typeof createDirectoryStore>;
