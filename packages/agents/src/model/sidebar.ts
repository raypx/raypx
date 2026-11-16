import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type SidebarSection = "agents" | "groups" | "space" | "recent";
export interface SidebarState {
  origin: string;
  accountId: string;
  spaceId: string | null;
  agentId: string | null;
  groupId: string | null;
  route: string;
  pendingSelection: string | null;
  collapsed: Partial<Record<SidebarSection, boolean>>;
  open: boolean;
  sheetOpen: boolean;
  scrollTop: number;
  sectionScroll: Partial<Record<SidebarSection, number>>;
  setSectionScroll: (section: SidebarSection, top: number) => void;
  recentOrder: string[];
  agentFilter: { spaceId: string | null; text: string; open: boolean };
  setAgentFilter: (value: SidebarState["agentFilter"]) => void;
  setRecentOrder: (ids: string[]) => void;
  select: (selection: {
    spaceId: string | null;
    agentId?: string | null | undefined;
    groupId?: string | null | undefined;
  }) => void;
  setRoute: (route: string) => void;
  setCollapsed: (section: SidebarSection, collapsed: boolean) => void;
  setOpen: (open: boolean) => void;
  setSheetOpen: (open: boolean) => void;
  setScrollTop: (scrollTop: number) => void;
  reset: (origin: string, accountId: string) => void;
}

export function sidebarStorageKey(origin: string, accountId: string) {
  return JSON.stringify(["raypx_sidebar", origin, accountId]);
}

/** Device preferences only. A blocked storage implementation keeps the in-memory choice. */
export function safeSidebarStorage(storage: () => StateStorage): StateStorage {
  return {
    getItem(name) {
      try {
        return storage().getItem(name);
      } catch {
        return null;
      }
    },
    setItem(name, value) {
      try {
        return storage().setItem(name, value);
      } catch {
        /* Memory remains usable. */
      }
    },
    removeItem(name) {
      try {
        return storage().removeItem(name);
      } catch {
        /* No rendering dependency. */
      }
    },
  };
}

export function createSidebarStore(
  origin: string,
  accountId: string,
  suppliedStorage = safeSidebarStorage(() => localStorage),
) {
  const safeStorage = safeSidebarStorage(() => suppliedStorage);
  let hydrated = false;
  const storage: StateStorage = {
    getItem(name) {
      const saved = safeStorage.getItem(name);
      hydrated = true;
      return saved;
    },
    setItem(name, value) {
      // Child layout effects may update selection before the layout hydrates preferences.
      if (hydrated) return safeStorage.setItem(name, value);
    },
    removeItem: (name) => safeStorage.removeItem(name),
  };
  function initial() {
    return {
      spaceId: null,
      agentId: null,
      groupId: null,
      route: "",
      pendingSelection: null,
      collapsed: {},
      open: true,
      sheetOpen: false,
      scrollTop: 0,
      sectionScroll: {},
      recentOrder: [],
      agentFilter: { spaceId: null, text: "", open: false },
    };
  }
  const store = createStore<SidebarState>()(
    persist(
      (set) => ({
        origin,
        accountId,
        ...initial(),
        select: (selection) =>
          set((state) => ({
            spaceId: selection.spaceId,
            agentId: selection.agentId ?? null,
            groupId: selection.groupId ?? null,
            pendingSelection: selection.agentId ?? selection.groupId ?? null,
            route: selection.agentId || selection.groupId ? "/agents" : state.route,
          })),
        setRoute: (route) => set({ route, pendingSelection: null }),
        setCollapsed: (section, collapsed) =>
          set((state) => ({ collapsed: { ...state.collapsed, [section]: collapsed } })),
        setOpen: (open) => set({ open }),
        setSheetOpen: (sheetOpen) => set({ sheetOpen }),
        setAgentFilter: (agentFilter) => set({ agentFilter }),
        setSectionScroll: (section, top) =>
          set((state) => ({ sectionScroll: { ...state.sectionScroll, [section]: top } })),
        setRecentOrder: (recentOrder) => set({ recentOrder }),
        setScrollTop: (scrollTop) => set({ scrollTop }),
        reset: (nextOrigin, nextAccountId) => {
          store.persist.setOptions({ name: sidebarStorageKey(nextOrigin, nextAccountId) });
          // Hydrate the next identity before any write can overwrite its preference.
          const saved = storage.getItem(sidebarStorageKey(nextOrigin, nextAccountId));
          let preferences = {};
          if (typeof saved === "string") {
            try {
              const value = JSON.parse(saved);
              if (value.version === 1) preferences = sidebarPreferences(value.state);
            } catch {
              /* Ignore malformed preferences. */
            }
          }
          set({ origin: nextOrigin, accountId: nextAccountId, ...initial(), ...preferences });
        },
      }),
      {
        name: sidebarStorageKey(origin, accountId),
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ open: state.open, collapsed: state.collapsed }),
        merge: (saved, current) => ({ ...current, ...sidebarPreferences(saved) }),
        skipHydration: true,
      },
    ),
  );
  return store;
}
export type SidebarStore = ReturnType<typeof createSidebarStore>;

function sidebarPreferences(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const saved = value as { open?: unknown; collapsed?: unknown };
  const collapsed: SidebarState["collapsed"] = {};
  if (saved.collapsed && typeof saved.collapsed === "object") {
    for (const section of ["agents", "groups", "space", "recent"] as const) {
      const choice = Reflect.get(saved.collapsed, section);
      if (typeof choice === "boolean") collapsed[section] = choice;
    }
  }
  return { open: saved.open !== false, collapsed };
}
