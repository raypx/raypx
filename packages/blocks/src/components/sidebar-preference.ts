const key = "raypx_sidebar_open";

/** Caller-owned device preference; the shared shadcn primitive stays stateless. */
export function sidebarPreference() {
  let open = true;
  let initialized = false;
  const listeners = new Set<() => void>();
  const read = () => {
    try {
      open = localStorage.getItem(key) !== "false";
    } catch {
      // Sandboxed previews can keep an in-memory preference.
    }
    initialized = true;
  };
  return {
    snapshot: () => {
      if (!initialized && typeof window !== "undefined") read();
      return open;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      const update = (event: StorageEvent) => {
        if (event.key !== key && event.key !== null) return;
        read();
        listener();
      };
      window.addEventListener("storage", update);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", update);
      };
    },
    set: (value: boolean) => {
      open = value;
      initialized = true;
      try {
        localStorage.setItem(key, String(value));
      } catch {
        // Keep the user's current choice even when persistence is unavailable.
      }
      for (const listener of listeners) listener();
    },
  };
}
