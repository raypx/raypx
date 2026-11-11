import { createContext, useContext, type ReactNode } from "react";
import * as desktop from "./desktop.js";
import type { DesktopPlatform } from "./platform.js";

// Lazy delegates let application composition own native discovery and connection.
const applicationPlatform: DesktopPlatform = {
  isDesktop: () => desktop.isDesktop(),
  hasTerminalHooks: () => desktop.hasTerminalHooks(),
  getBridge: () => desktop.getBridge(),
  getDesktopRuntime: () => desktop.getDesktopRuntime(),
  onLocalEvent: (listener) => desktop.onLocalEvent(listener),
  pickDirectory: () => desktop.pickDirectory(),
  restartEngine: (replace) => desktop.restartEngine(replace),
  localRequest: (method, params) => desktop.localRequest(method, params),
  saveDesktopPreferences: (preferences) => desktop.saveDesktopPreferences(preferences),
};
const PlatformContext = createContext(applicationPlatform);
export function DesktopPlatformProvider({
  platform,
  children,
}: {
  platform: DesktopPlatform;
  children: ReactNode;
}) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}
export function useDesktopPlatform() {
  return useContext(PlatformContext);
}
