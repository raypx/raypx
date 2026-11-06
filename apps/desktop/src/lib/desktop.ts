import { createDesktopPlatform } from "./platform";

const platform = createDesktopPlatform({
  available: () => typeof window !== "undefined" && window.__raypxDesktopHost === "mygo",
  terminalHooks: () =>
    typeof window !== "undefined" &&
    "__raypxTerminalHooks" in window &&
    window.__raypxTerminalHooks === true,
  connect: async (dispatch) => (await import("./mygo")).createMyGoBridge(dispatch),
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
