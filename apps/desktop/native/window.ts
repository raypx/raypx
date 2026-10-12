import type { BrowserWindow } from "electrobun/main/browser-window";

export const MINIMUM_WINDOW_SIZE = { width: 800, height: 620 };

type WindowControl = Pick<
  BrowserWindow,
  "on" | "hide" | "show" | "activate" | "unminimize" | "getSize" | "setSize"
>;

export function wireWindow(window: WindowControl, trayAvailable: () => boolean, quit: () => void) {
  const show = () => {
    window.unminimize();
    window.show();
    window.activate();
  };
  let resizing = false;
  window.on("will-close", (event) => {
    if (!trayAvailable() || !event || typeof event !== "object") return;
    Reflect.set(event, "response", { allow: false });
    window.hide();
  });
  window.on("close", () => {
    if (!trayAvailable()) quit();
  });
  window.on("resize", () => {
    if (resizing) return;
    const { width, height } = window.getSize();
    if (width >= MINIMUM_WINDOW_SIZE.width && height >= MINIMUM_WINDOW_SIZE.height) return;
    resizing = true;
    try {
      window.setSize(
        Math.max(width, MINIMUM_WINDOW_SIZE.width),
        Math.max(height, MINIMUM_WINDOW_SIZE.height),
      );
    } finally {
      resizing = false;
    }
  });
  return { show, hide: () => window.hide() };
}
