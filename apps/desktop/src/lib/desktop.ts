import { invoke } from "@tauri-apps/api/core";

export interface DesktopRuntime {
  appVersion: string;
  platform: string;
  trayEnabled: boolean;
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function getDesktopRuntime(): Promise<DesktopRuntime> {
  if (!isTauriRuntime()) {
    return { appVersion: "0.1.0", platform: "browser", trayEnabled: false };
  }

  try {
    return await invoke<DesktopRuntime>("desktop_runtime");
  } catch {
    return { appVersion: "0.1.0", platform: "unknown", trayEnabled: true };
  }
}

export async function hideMainWindow(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    await invoke("hide_main_window");
    return true;
  } catch {
    return false;
  }
}
