import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import type { SidebarState, SidebarStore } from "../model/sidebar.js";

export const SidebarStoreContext = createContext<SidebarStore | null>(null);
export function SidebarStateProvider({
  store,
  children,
}: {
  store: SidebarStore;
  children: ReactNode;
}) {
  return <SidebarStoreContext.Provider value={store}>{children}</SidebarStoreContext.Provider>;
}
export function useWorkspaceSidebar<T>(selector: (state: SidebarState) => T): T {
  const store = useContext(SidebarStoreContext);
  if (!store) throw new Error("Workspace sidebar requires its layout provider");
  return useStore(store, selector);
}
