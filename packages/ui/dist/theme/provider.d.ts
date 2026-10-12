import { type AppTheme, type UserTheme } from "./config";
interface ThemeContextValue {
    theme: UserTheme;
    resolvedTheme: AppTheme;
    setTheme: (theme: UserTheme) => void;
}
export interface ThemeProviderProps {
    children: React.ReactNode;
    defaultTheme?: UserTheme;
    initialTheme?: UserTheme;
    onThemeChange?: (theme: UserTheme) => void;
    disableTransitionOnChange?: boolean;
    disableScript?: boolean;
    storageKey?: string | false;
}
export declare function ThemeScript({ storageKey }: {
    storageKey?: string | false;
}): any;
export declare function ThemeProvider({ children, defaultTheme, initialTheme: initialThemeProp, onThemeChange, disableTransitionOnChange, disableScript, storageKey, }: ThemeProviderProps): any;
export declare function useTheme(): ThemeContextValue;
export {};
//# sourceMappingURL=provider.d.ts.map