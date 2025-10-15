import { ThemeProvider as NextThemeProvider } from "next-themes";
import type { ThemeMode } from "./themes/context";

export const ThemeProvider = ({
  children,
  defaultTheme = "system",
}: {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
}) => {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme={defaultTheme}
      disableTransitionOnChange
      enableSystem
    >
      {children}
    </NextThemeProvider>
  );
};
