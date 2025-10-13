import { createContext } from "react";
import { z } from "zod";

/**
 * Available resolved theme values (excludes "system")
 */
export const resolvedThemes = ["light", "dark"] as const;

/**
 * Available theme mode values (includes "system")
 */
export const themes = [...resolvedThemes, "system"] as const;

/**
 * Zod schema for validating theme mode values
 */
export const themeModeSchema = z.enum(themes);

/**
 * LocalStorage key for persisting theme preference
 */
export const themeKey = "theme" as const;

/**
 * Theme mode type - the user's selected preference
 * Can be "light", "dark", or "system" (follow OS preference)
 */
export type ThemeMode = (typeof themes)[number];

/**
 * Resolved theme type - the actual applied theme
 * Always "light" or "dark" (system is resolved to one of these)
 */
export type ResolvedTheme = (typeof resolvedThemes)[number];

/**
 * Theme context value shape
 */
export type ThemeContextProps = {
  /** Current theme mode selected by user */
  themeMode: ThemeMode;
  /** Actual theme applied (system resolved to light/dark) */
  resolvedTheme: ResolvedTheme;
  /** Change the theme mode */
  setTheme: (theme: ThemeMode) => void;
  /** Toggle between themes in a logical order */
  toggleMode: () => void;
};

/**
 * React context for theme state management
 */
export const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);
