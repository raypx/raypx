import { createDesktopPlatform } from "./platform.js";

const platform = createDesktopPlatform({
  available: () => typeof window !== "undefined" && window.__raypxDesktopHost === "mygo",
  connect: async (dispatch) => (await import("./mygo.js")).createMyGoBridge(dispatch),
});
export const {
  isDesktop,
  getBridge,
  getDesktopRuntime,
  onLocalEvent,
  pairDeviceConnector,
  grantDeviceDirectory,
  restartEngine,
  localRequest,
  saveDesktopPreferences,
} = platform;
