import { useContext } from "react";
import { ThemeContext } from "../components/themes/context";

// Re-export types and constants for convenience
export {
  type ResolvedTheme,
  resolvedThemes,
  type ThemeMode,
  themes,
} from "../components/themes/context";

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
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
