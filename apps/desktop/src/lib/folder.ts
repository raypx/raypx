import { invoke } from "@tauri-apps/api/core";

export interface PiRuntimeStatus {
  availability: "ready" | "preview" | "unavailable";
  provider?: string;
  authorizedProject?: string;
  reason?: string;
}

export async function authorizeProjectFolder(path: string): Promise<PiRuntimeStatus> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window))
    return { availability: "preview", reason: "Folder access is unavailable in browser preview." };
  return invoke<PiRuntimeStatus>("authorize_project_folder", { input: { path } });
}
