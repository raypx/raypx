import { createDesktopPlatform } from "./platform.ts";

const platform = createDesktopPlatform({
  available: () => typeof window !== "undefined" && window.__raypxDesktopHost === "tauri",
  terminalHooks: () =>
    typeof window !== "undefined" &&
    "__raypxTerminalHooks" in window &&
    window.__raypxTerminalHooks === true,
  connect: async (dispatch) => (await import("./tauri.ts")).createTauriBridge(dispatch),
});
export const {
  isDesktop,
  hasTerminalHooks,
  getBridge,
  getDesktopRuntime,
  onLocalEvent,
  pickDirectory,
  restartEngine,
  localRequest,
  saveDesktopPreferences,
} = platform;
