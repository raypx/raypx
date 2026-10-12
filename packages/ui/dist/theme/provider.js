"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { THEME_STORAGE_KEY, parseTheme } from "./config";
function getCookieTheme(storageKey, fallback) {
    if (typeof document === "undefined")
        return null;
    try {
        const value = document.cookie
            .split("; ")
            .find((row) => row.startsWith(`${storageKey}=`))
            ?.split("=")[1];
        return value ? parseTheme(decodeURIComponent(value), fallback) : null;
    }
    catch {
        return null;
    }
}
function getStoredTheme(storageKey, fallback) {
    if (storageKey === false || typeof window === "undefined")
        return fallback;
    try {
        return parseTheme(window.localStorage.getItem(storageKey), getCookieTheme(storageKey, fallback) ?? fallback);
    }
    catch {
        return getCookieTheme(storageKey, fallback) ?? fallback;
    }
}
function getSystemTheme() {
    if (typeof window === "undefined")
        return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function resolveTheme(theme) {
    return theme === "system" ? getSystemTheme() : theme;
}
function getHydrationResolvedTheme(theme) {
    return theme === "system" ? "light" : theme;
}
function storeTheme(storageKey, theme) {
    if (storageKey === false)
        return;
    try {
        window.localStorage.setItem(storageKey, theme);
    }
    catch {
        // Theme switching still works when storage is unavailable.
    }
    try {
        document.cookie = `${storageKey}=${encodeURIComponent(theme)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }
    catch {
        // Cookie persistence is best effort and must not block theme changes.
    }
}
function applyTheme(theme) {
    if (typeof document === "undefined")
        return;
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.style.colorScheme = theme;
}
function setupMediaListener(onChange) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => onChange();
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
}
function createThemeScript(storageKey) {
    const encodedKey = JSON.stringify(storageKey);
    return `(function(){
  try {
    var key = ${encodedKey};
    var cookie = document.cookie.split("; ").find(function(row){ return row.indexOf(key + "=") === 0; });
    var cookieTheme = cookie ? decodeURIComponent(cookie.split("=")[1]) : null;
    var storedTheme;
    try { storedTheme = localStorage.getItem(key); } catch(e) {}
    var theme = storedTheme || cookieTheme || "system";
    if (theme !== "light" && theme !== "dark" && theme !== "system") theme = "system";
    var resolved = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.classList.add(resolved);
    document.documentElement.style.colorScheme = resolved;
  } catch(e) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.add("light");
    document.documentElement.style.colorScheme = "light";
  }
})();`;
}
export function ThemeScript({ storageKey = THEME_STORAGE_KEY }) {
    if (storageKey === false)
        return null;
    // oxlint-disable-next-line react/no-danger
    return _jsx("script", { dangerouslySetInnerHTML: { __html: createThemeScript(storageKey) } });
}
const ThemeContext = createContext(undefined);
export function ThemeProvider({ children, defaultTheme = "system", initialTheme: initialThemeProp, onThemeChange, disableTransitionOnChange = false, disableScript = false, storageKey = THEME_STORAGE_KEY, }) {
    const initialTheme = parseTheme(initialThemeProp, defaultTheme);
    const [theme, setThemeState] = useState(initialTheme);
    const [resolvedTheme, setResolvedTheme] = useState(() => getHydrationResolvedTheme(theme));
    useEffect(() => {
        const storedTheme = getStoredTheme(storageKey, initialTheme);
        const nextResolvedTheme = resolveTheme(storedTheme);
        setThemeState(storedTheme);
        setResolvedTheme(nextResolvedTheme);
        applyTheme(nextResolvedTheme);
    }, [initialTheme, storageKey]);
    useEffect(() => {
        const nextResolvedTheme = resolveTheme(theme);
        setResolvedTheme(nextResolvedTheme);
        if (disableTransitionOnChange && typeof document !== "undefined") {
            const style = document.createElement("style");
            style.append(document.createTextNode("*,*::before,*::after{transition:none!important;animation:none!important}"));
            document.head.append(style);
            void window.getComputedStyle(document.body);
            window.setTimeout(() => style.remove(), 1);
        }
        applyTheme(nextResolvedTheme);
    }, [disableTransitionOnChange, theme]);
    useEffect(() => {
        if (theme !== "system" || typeof window === "undefined")
            return;
        return setupMediaListener(() => {
            const nextResolvedTheme = getSystemTheme();
            setResolvedTheme(nextResolvedTheme);
            applyTheme(nextResolvedTheme);
        });
    }, [theme]);
    useEffect(() => {
        if (storageKey === false || typeof window === "undefined")
            return;
        const handler = (event) => {
            if (event.key !== storageKey)
                return;
            const nextTheme = parseTheme(event.newValue, defaultTheme);
            setThemeState(nextTheme);
            setResolvedTheme(resolveTheme(nextTheme));
            applyTheme(resolveTheme(nextTheme));
        };
        window.addEventListener("storage", handler);
        return () => window.removeEventListener("storage", handler);
    }, [defaultTheme, storageKey]);
    const setTheme = useCallback((nextTheme) => {
        setThemeState(nextTheme);
        storeTheme(storageKey, nextTheme);
        const resolved = resolveTheme(nextTheme);
        setResolvedTheme(resolved);
        applyTheme(resolved);
        onThemeChange?.(nextTheme);
    }, [onThemeChange, storageKey]);
    const contextValue = useMemo(() => ({ theme, resolvedTheme, setTheme }), [resolvedTheme, setTheme, theme]);
    return (_jsxs(ThemeContext, { value: contextValue, children: [!disableScript ? _jsx(ThemeScript, { storageKey: storageKey }) : null, children] }));
}
export function useTheme() {
    const context = use(ThemeContext);
    if (!context)
        throw new Error("useTheme must be used within a ThemeProvider");
    return context;
}
//# sourceMappingURL=provider.js.map