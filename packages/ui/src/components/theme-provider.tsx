import { ScriptOnce } from "@tanstack/react-router";
import { createClientOnlyFn, createIsomorphicFn } from "@tanstack/react-start";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ResolvedTheme,
  ThemeContext,
  type ThemeMode,
  themeKey,
  themeModeSchema,
} from "./themes/context";

const getStoredThemeMode = createIsomorphicFn()
  .server((): ThemeMode => "system")
  .client((): ThemeMode => {
    try {
      return themeModeSchema.parse(localStorage.getItem(themeKey));
    } catch {
      return "system";
    }
  });

const setStoredThemeMode = createClientOnlyFn((theme: ThemeMode) => {
  try {
    localStorage.setItem(themeKey, themeModeSchema.parse(theme));
  } catch {}
});

const getSystemTheme = createIsomorphicFn()
  .server((): ResolvedTheme => "light")
  .client((): ResolvedTheme =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );

const updateThemeClass = createClientOnlyFn((themeMode: ThemeMode, enableTransition = true) => {
  const applyTheme = () => {
    const root = document.documentElement;
    root.classList.remove("light", "dark", "system");
    const newTheme = themeMode === "system" ? getSystemTheme() : themeMode;
    root.classList.add(newTheme);
    if (themeMode === "system") root.classList.add("system");
  };

  if (enableTransition && "startViewTransition" in document) {
    (document as any).startViewTransition(applyTheme);
  } else {
    applyTheme();
  }
});

const setupPreferredListener = createClientOnlyFn(() => {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => updateThemeClass("system", false);
  mediaQuery.addEventListener("change", handler);
  return () => mediaQuery.removeEventListener("change", handler);
});

const getNextTheme = createClientOnlyFn((current: ThemeMode): ThemeMode => {
  const themes: ThemeMode[] =
    getSystemTheme() === "dark" ? ["system", "light", "dark"] : ["system", "dark", "light"];
  return themes[(themes.indexOf(current) + 1) % themes.length] as ThemeMode;
});

// Inline script to prevent FOUC (Flash of Unstyled Content)
const themeDetectorScript = (() => {
  function themeFn() {
    const THEME_KEY = "theme";
    const VALID_THEMES = ["light", "dark", "system"];
    const getSystemTheme = () =>
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

    try {
      const stored = localStorage.getItem(THEME_KEY);
      const theme = VALID_THEMES.includes(stored || "") ? stored : "system";
      const root = document.documentElement;

      if (theme === "system") {
        root.classList.add(getSystemTheme(), "system");
      } else {
        root.classList.add(theme || "light");
      }
    } catch {
      document.documentElement.classList.add(getSystemTheme(), "system");
    }
  }
  return `(${themeFn.toString()})();`;
})();

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: ThemeMode;
  enableTransitions?: boolean;
};

export function ThemeProvider({
  children,
  defaultTheme = "system",
  enableTransitions = true,
}: ThemeProviderProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredThemeMode() || defaultTheme);
  const transitionsRef = useRef(enableTransitions);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    transitionsRef.current = enableTransitions;
  }, [enableTransitions]);

  useEffect(() => {
    if (themeMode !== "system") return;
    return setupPreferredListener();
  }, [themeMode]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key !== themeKey) return;
      try {
        const validatedTheme = themeModeSchema.parse(e.newValue);
        setThemeMode(validatedTheme);
        updateThemeClass(validatedTheme, false);
      } catch {}
    };

    if (typeof BroadcastChannel !== "undefined") {
      try {
        broadcastChannelRef.current = new BroadcastChannel("theme-sync");
        broadcastChannelRef.current.onmessage = (event) => {
          try {
            const validatedTheme = themeModeSchema.parse(event.data.theme);
            setThemeMode(validatedTheme);
            updateThemeClass(validatedTheme, false);
          } catch {}
        };
      } catch {
        broadcastChannelRef.current = null;
      }
    }

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
    };
  }, []);

  const resolvedTheme = useMemo<ResolvedTheme>(
    () => (themeMode === "system" ? getSystemTheme() : themeMode),
    [themeMode],
  );

  const setTheme = useCallback(
    (newTheme: ThemeMode) => {
      if (newTheme === themeMode) return;
      setThemeMode(newTheme);
      setStoredThemeMode(newTheme);
      updateThemeClass(newTheme, transitionsRef.current);

      if (broadcastChannelRef.current) {
        try {
          broadcastChannelRef.current.postMessage({ theme: newTheme });
        } catch {}
      }
    },
    [themeMode],
  );

  const toggleMode = useCallback(() => {
    setTheme(getNextTheme(themeMode));
  }, [themeMode, setTheme]);

  const contextValue = useMemo(
    () => ({ themeMode, resolvedTheme, setTheme, toggleMode }),
    [themeMode, resolvedTheme, setTheme, toggleMode],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <ScriptOnce>{themeDetectorScript}</ScriptOnce>
      {children}
    </ThemeContext.Provider>
  );
}
