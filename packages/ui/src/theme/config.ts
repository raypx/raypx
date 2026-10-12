export type UserTheme = "light" | "dark" | "system";
export type AppTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

const validThemes: ReadonlySet<UserTheme> = new Set(["light", "dark", "system"]);

export function parseTheme(raw: string | null | undefined, fallback: UserTheme): UserTheme {
  return validThemes.has(raw as UserTheme) ? (raw as UserTheme) : fallback;
}
