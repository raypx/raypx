import { createContext, useContext } from "react";
import type { Agent } from "@raypx/core/agents";
import type { SpaceEvent } from "@raypx/core/spaces";
export interface WorkspaceContext {
  spaceId: string;
  agents: readonly Agent[];
  accountNames: Record<string, string>;
  subscribe: (listener: (event: SpaceEvent) => void) => () => void;
}
const context = createContext<WorkspaceContext | null>(null);
export const WorkspaceContextProvider = context.Provider;
export function useWorkspaceContext() {
  const value = useContext(context);
  if (!value) throw new Error("Member pages require the persistent workspace");
  return value;
}
// Keep the context private while exposing the page-facing hook through /client.
