import { useTheme as useNextTheme } from "@raypx/ui/hooks/use-theme";

export const useTheme = () => {
  const { resolvedTheme, setTheme, themeMode } = useNextTheme();

  return {
    resolvedTheme: resolvedTheme as "light" | "dark",
    setTheme,
    theme: themeMode as "light" | "dark" | "system",
  };
};
