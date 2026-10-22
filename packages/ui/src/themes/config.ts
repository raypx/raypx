import { themeTokens } from "./tokens";

export { themeTokens, type ThemeToken } from "./tokens";

export type UserTheme = "light" | "dark" | "system";
export type AppTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/** Browser chrome colors follow each theme's `background` token. */
export const themeColors: Readonly<Record<AppTheme, string>> = {
  light: themeTokens.light.background,
  dark: themeTokens.dark.background,
};

/**
 * Document meta for app roots. `theme-color` is left to the theme script and provider:
 * React 19 hydrates head meta by its content, so a server-rendered tag the script had
 * already recolored would be duplicated rather than matched.
 */
export const themeMeta = [{ name: "color-scheme", content: "light dark" }] as const;

const validThemes: ReadonlySet<UserTheme> = new Set(["light", "dark", "system"]);

export function parseTheme(raw: string | null | undefined, fallback: UserTheme): UserTheme {
  return validThemes.has(raw as UserTheme) ? (raw as UserTheme) : fallback;
}

/** Reads the persisted theme from a Cookie header or `document.cookie`. */
export function readThemeCookie(
  cookie: string | null | undefined,
  storageKey: string = THEME_STORAGE_KEY,
): UserTheme | null {
  for (const part of (cookie ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key !== storageKey) continue;
    try {
      const theme = decodeURIComponent(value.join("="));
      return validThemes.has(theme as UserTheme) ? (theme as UserTheme) : null;
    } catch {
      return null;
    }
  }
  return null;
}
