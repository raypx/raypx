import { ThemeProvider as NextThemeProvider } from "next-themes";

export const ThemeProvider = ({
  children,
  defaultTheme = "system",
}: {
  children: React.ReactNode;
  defaultTheme?: string;
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
