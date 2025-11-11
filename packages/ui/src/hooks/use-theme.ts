import { useTheme as useNextTheme } from "next-themes";

/**
 * Hook to access and control the current theme
 *
 * @returns Theme context with current theme state and control functions
 * @throws Error if used outside of ThemeProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { themeMode, resolvedTheme, setTheme, toggleMode } = useTheme();
 *
 *   return (
 *     <div>
 *       <p>Current mode: {themeMode}</p>
 *       <p>Resolved theme: {resolvedTheme}</p>
 *       <button onClick={() => setTheme('dark')}>Dark</button>
 *       <button onClick={toggleMode}>Toggle</button>
 *     </div>
 *   );
 * }
 * ```
 */
export const useTheme = () => {
  const { theme, setTheme, resolvedTheme } = useNextTheme();
  return { themeMode: theme, theme, setTheme, resolvedTheme };
};
