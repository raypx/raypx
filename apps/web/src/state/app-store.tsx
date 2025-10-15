import { type ResolvedTheme, type ThemeMode, useTheme } from "@raypx/ui/hooks/use-theme";
import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react";
import { type StoreApi, useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import i18n, { changeLanguage } from "@/lib/i18n";
import { type AppLanguageKey, DEFAULT_LANGUAGE_KEY } from "@/lib/i18n/constants";

type AppState = {
  language: AppLanguageKey;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
};

type AppActions = {
  setLanguage: (language: AppLanguageKey) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

export type AppStore = AppState & AppActions;

type CreateAppStoreOptions = {
  initialLanguage: AppLanguageKey;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setThemeRef: MutableRefObject<(theme: ThemeMode) => void>;
  toggleThemeRef: MutableRefObject<() => void>;
};

const createAppStore = ({
  initialLanguage,
  themeMode,
  resolvedTheme,
  setThemeRef,
  toggleThemeRef,
}: CreateAppStoreOptions) =>
  createStore<AppStore>((set, get) => ({
    language: initialLanguage,
    themeMode,
    resolvedTheme,
    setLanguage: (language) => {
      if (get().language === language) {
        return;
      }

      set({ language });

      void changeLanguage(language).catch((error) => {
        console.error(`[AppStore] Failed to change language to ${language}`, error);
      });
    },
    setTheme: (theme) => {
      if (get().themeMode === theme) {
        return;
      }

      const setter = setThemeRef.current;
      if (!setter) {
        console.error("[AppStore] Theme setter is not available");
        return;
      }

      setter(theme);
    },
    toggleTheme: () => {
      const toggle = toggleThemeRef.current;
      if (!toggle) {
        console.error("[AppStore] Theme toggle is not available");
        return;
      }

      toggle();
    },
  }));

const AppStoreContext = createContext<StoreApi<AppStore> | null>(null);

type AppStoreProviderProps = {
  children: ReactNode;
  initialLanguage?: AppLanguageKey;
};

export function AppStoreProvider({
  children,
  initialLanguage = DEFAULT_LANGUAGE_KEY,
}: AppStoreProviderProps) {
  const { themeMode, resolvedTheme, setTheme, toggleMode } = useTheme();
  const setThemeRef = useRef(setTheme);
  const toggleThemeRef = useRef(toggleMode);
  const storeRef = useRef<StoreApi<AppStore>>();

  setThemeRef.current = setTheme;
  toggleThemeRef.current = toggleMode;

  if (!storeRef.current) {
    storeRef.current = createAppStore({
      initialLanguage,
      themeMode,
      resolvedTheme,
      setThemeRef,
      toggleThemeRef,
    });
  } else {
    const store = storeRef.current;
    const currentState = store.getState();

    if (currentState.language !== initialLanguage) {
      store.setState({ language: initialLanguage });
    }

    if (currentState.themeMode !== themeMode || currentState.resolvedTheme !== resolvedTheme) {
      store.setState({ themeMode, resolvedTheme });
    }
  }

  useEffect(() => {
    const store = storeRef.current;
    if (!store) {
      return;
    }

    const handleLanguageChange = (nextLanguage: string) => {
      const typedLanguage = nextLanguage as AppLanguageKey;
      if (store.getState().language === typedLanguage) {
        return;
      }

      store.setState({ language: typedLanguage });
    };

    i18n.on("languageChanged", handleLanguageChange);

    return () => {
      i18n.off("languageChanged", handleLanguageChange);
    };
  }, []);

  useEffect(() => {
    const store = storeRef.current;
    if (!store) {
      return;
    }

    const currentState = store.getState();
    if (currentState.themeMode !== themeMode || currentState.resolvedTheme !== resolvedTheme) {
      store.setState({ themeMode, resolvedTheme });
    }
  }, [themeMode, resolvedTheme]);

  return <AppStoreContext.Provider value={storeRef.current}>{children}</AppStoreContext.Provider>;
}

export function useAppStoreSelector<T>(selector: (state: AppStore) => T): T {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error("useAppStoreSelector must be used within an AppStoreProvider");
  }

  return useStore(store, selector);
}

export function useAppLanguage() {
  const language = useAppStoreSelector((state) => state.language);
  const setLanguage = useAppStoreSelector((state) => state.setLanguage);

  return { language, setLanguage };
}

export function useAppTheme() {
  const themeMode = useAppStoreSelector((state) => state.themeMode);
  const resolvedTheme = useAppStoreSelector((state) => state.resolvedTheme);
  const setTheme = useAppStoreSelector((state) => state.setTheme);
  const toggleTheme = useAppStoreSelector((state) => state.toggleTheme);

  return { themeMode, resolvedTheme, setTheme, toggleTheme };
}
