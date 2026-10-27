import type { BrowserWindow } from "electrobun/main/browser-window";

export const MINIMUM_WINDOW_SIZE = { width: 800, height: 620 };

/** Smoke tests stay inactive unless foreground GUI acceptance was explicitly selected. */
export function nativePresentation(environment: Readonly<Record<string, string | undefined>>) {
  const interactive =
    environment.RAYPX_NATIVE_SMOKE !== "1" || environment.RAYPX_NATIVE_SMOKE_UI === "interactive";
  return { activate: interactive, notifications: interactive, dialogs: interactive };
}

type WindowControl = Pick<
  BrowserWindow,
  "on" | "hide" | "show" | "showInactive" | "activate" | "unminimize" | "getSize" | "setSize"
>;

export function wireWindow(
  window: WindowControl,
  trayAvailable: () => boolean,
  quit: () => void,
  visibilityChanged = () => {},
  presentation: { activate: boolean } = { activate: true },
) {
  const show = () => {
    if (presentation.activate) {
      window.unminimize();
      window.show();
      window.activate();
    } else window.showInactive();
    visibilityChanged();
  };
  let resizing = false;
  window.on("will-close", (event) => {
    if (!trayAvailable() || !event || typeof event !== "object") return;
    Reflect.set(event, "response", { allow: false });
    window.hide();
    visibilityChanged();
  });
  window.on("close", () => {
    if (!trayAvailable()) quit();
  });
  window.on("resize", () => {
    visibilityChanged();
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
  return {
    show,
    hide: () => {
      window.hide();
      visibilityChanged();
    },
  };
}
