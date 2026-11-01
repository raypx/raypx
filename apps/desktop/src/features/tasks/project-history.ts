import { desktopStorageKey } from "../../lib/storage";

const recentKey = "raypx.recent-projects.v1";
export function recentProjects(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(desktopStorageKey(recentKey)) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string" && id.length <= 256).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
export function rememberProject(id: string) {
  try {
    localStorage.setItem(
      desktopStorageKey(recentKey),
      JSON.stringify([id, ...recentProjects().filter((value) => value !== id)].slice(0, 20)),
    );
  } catch {
    /* A storage failure must not block local work. */
  }
}
