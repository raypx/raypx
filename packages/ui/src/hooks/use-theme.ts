import { useTheme as useNextTheme } from "next-themes";

/**
 * Hook to access and control the current theme
 *
 * @returns Theme context with current theme state and control functions
 * @throws Error if used outside of ThemeProvider
 */
export const useTheme = () => {
  const { theme, setTheme, resolvedTheme } = useNextTheme();
  return { themeMode: theme, theme, setTheme, resolvedTheme };
};
