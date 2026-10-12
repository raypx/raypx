import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

interface DesktopPreferences {
  theme: "dark" | "light";
}

interface DesktopPreferencesStore extends DesktopPreferences {
  toggleTheme(): void;
}

const defaults: DesktopPreferences = {
  theme: "dark",
};

// Storage may be unavailable in a WebView or private browser. Keep the current
// session usable even when preferences cannot be saved.
const storage: StateStorage = {
  getItem(name) {
    try {
      const saved = localStorage.getItem(name);
      if (saved !== null) return saved;
      const currentTheme = localStorage.getItem("raypx.desktop.theme");
      if (currentTheme === "dark" || currentTheme === "light")
        return JSON.stringify({ state: { theme: currentTheme }, version: 1 });
      // Previous installs keep the theme; new Raypx preferences always win.
      const previous = localStorage.getItem("voidmix.desktop.preferences");
      let theme: unknown;
      if (previous !== null) {
        try {
          theme = (JSON.parse(previous) as { state?: { theme?: unknown } }).state?.theme;
        } catch {
          // Try the older theme-only format when saved JSON is corrupt.
        }
      }
      if (theme !== "dark" && theme !== "light")
        theme = localStorage.getItem("voidmix.desktop.theme");
      if (theme !== "dark" && theme !== "light") return null;
      const migrated = JSON.stringify({ state: { theme }, version: 1 });
      try {
        localStorage.setItem(name, migrated);
      } catch {
        // Read the old theme even when migration cannot be persisted.
      }
      return migrated;
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
    }),
    {
      name: "raypx.desktop.preferences",
      version: 1,
      storage: createJSONStorage(() => storage),
      // Start prerenders a deterministic shell; the mounted shell restores the
      // browser's preferences after hydration.
      skipHydration: true,
      partialize: ({ theme }) => ({ theme }),
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== "object") return current;
        const theme: unknown = Reflect.get(persisted, "theme");
        return theme === "dark" || theme === "light" ? { ...current, theme } : current;
      },
    },
  ),
);
