import { LocalizedWebError } from "../../../i18n/error-message";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createDirectoryStore, type DirectoryState, type DirectoryStore } from "./store";
const Context = createContext<DirectoryStore | null>(null);
export function DirectoryProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createDirectoryStore);
  useEffect(() => {
    store.getState().activate();
    return () => store.getState().dispose();
  }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useDirectoryStore() {
  const store = useContext(Context);
  if (!store) throw new LocalizedWebError("DIRECTORY_PROVIDER_REQUIRED");
  return store;
}
export function useDirectorySelector<T>(selector: (state: DirectoryState) => T): T {
  return useStore(useDirectoryStore(), selector);
}
