import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

interface DesktopPreferences {
  theme: "dark" | "light";
  syncPaused: boolean;
  startWithSystem: boolean;
  meteredNetworks: boolean;
  automaticDownloads: boolean;
  transferSummaries: boolean;
  workspaceChanges: boolean;
}

export type DesktopToggle = Exclude<keyof DesktopPreferences, "theme">;

interface DesktopPreferencesStore extends DesktopPreferences {
  toggleTheme(): void;
  togglePreference(key: DesktopToggle): void;
}

const defaults: DesktopPreferences = {
  theme: "dark",
  syncPaused: false,
  startWithSystem: false,
  meteredNetworks: false,
  automaticDownloads: true,
  transferSummaries: true,
  workspaceChanges: true,
};

// Storage may be unavailable in a WebView or private browser. Keep the current
// session usable even when preferences cannot be saved.
const storage: StateStorage = {
  getItem(name) {
    try {
      const saved = localStorage.getItem(name);
      if (saved !== null) return saved;
      const theme = localStorage.getItem("voidmix.desktop.theme");
      return theme === "dark" || theme === "light"
        ? JSON.stringify({ state: { theme }, version: 1 })
        : null;
    } catch {
      return null;
    }
  },
  setItem(name, value) {
    try {
      localStorage.setItem(name, value);
    } catch {
      // The in-memory store remains authoritative for this session.
    }
  },
  removeItem(name) {
    try {
      localStorage.removeItem(name);
    } catch {
      // Resetting the current session does not depend on writable storage.
    }
  },
};

export const useDesktopPreferences = create<DesktopPreferencesStore>()(
  persist(
    (set) => ({
      ...defaults,
      toggleTheme: () => set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
      togglePreference: (key) => set((state) => ({ [key]: !state[key] })),
    }),
    {
      name: "voidmix.desktop.preferences",
      version: 1,
      storage: createJSONStorage(() => storage),
      // Start prerenders a deterministic shell; the mounted shell restores the
      // browser's preferences after hydration.
      skipHydration: true,
      partialize: ({
        theme,
        syncPaused,
        startWithSystem,
        meteredNetworks,
        automaticDownloads,
        transferSummaries,
        workspaceChanges,
      }) => ({
        theme,
        syncPaused,
        startWithSystem,
        meteredNetworks,
        automaticDownloads,
        transferSummaries,
        workspaceChanges,
      }),
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== "object") return current;
        const restored = { ...current };
        for (const key of Object.keys(defaults) as Array<keyof DesktopPreferences>) {
          const value: unknown = Reflect.get(persisted, key);
          if (key === "theme") {
            if (value === "dark" || value === "light") restored.theme = value;
          } else if (typeof value === "boolean") {
            restored[key] = value;
          }
        }
        return restored;
      },
    },
  ),
);
