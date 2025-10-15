import { createContext, type ReactNode, useContext, useEffect, useRef } from "react";
import { type StoreApi, useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import i18n, { changeLanguage } from "@/lib/i18n";
import { type AppLanguageKey, DEFAULT_LANGUAGE_KEY } from "@/lib/i18n/constants";

type AppState = {
  language: AppLanguageKey;
};

type AppActions = {
  setLanguage: (language: AppLanguageKey) => void;
};

export type AppStore = AppState & AppActions;

const createAppStore = (initialLanguage: AppLanguageKey) =>
  createStore<AppStore>((set, get) => ({
    language: initialLanguage,
    setLanguage: (language) => {
      if (get().language === language) {
        return;
      }

      set({ language });

      void changeLanguage(language).catch((error) => {
        console.error(`[AppStore] Failed to change language to ${language}`, error);
      });
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
  const storeRef = useRef<StoreApi<AppStore>>();

  if (!storeRef.current) {
    storeRef.current = createAppStore(initialLanguage);
  } else {
    const store = storeRef.current;
    if (store.getState().language !== initialLanguage) {
      store.setState({ language: initialLanguage });
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
