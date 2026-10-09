import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/select";
import { Toaster } from "@raypx/ui/components/sonner";

type Theme = "system" | "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({
  theme: "system",
  setTheme: () => {},
});
const storageKey = "raypx-theme";
const changeEvent = "raypx-theme-change";

function readTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : "system";
}

function subscribeTheme(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    document.documentElement.dataset.theme =
      event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system";
    notify();
  };
  window.addEventListener(changeEvent, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, notify);
    window.removeEventListener("storage", onStorage);
  };
}

function setTheme(theme: Theme) {
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    /* Storage may be disabled. */
  }
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(changeEvent));
}

// Fixed source, with no interpolated user data. Applied before hydration to avoid a theme flash.
export const themeInitialization = `(()=>{let t="system";try{const s=localStorage.getItem("raypx-theme");if(s==="light"||s==="dark")t=s}catch{}document.documentElement.classList.toggle("dark",t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches));document.documentElement.dataset.theme=t})()`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, (): Theme => "system");
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      // The server snapshot is "system" during hydration; the inline initializer
      // has already restored the actual preference into the external store.
      const preference = readTheme();
      document.documentElement.classList.toggle(
        "dark",
        preference === "dark" || (preference === "system" && media.matches),
      );
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
      <Toaster theme={theme} />
    </ThemeContext.Provider>
  );
}

export function ThemeSelect() {
  const { theme, setTheme } = useContext(ThemeContext);
  return (
    <Select
      value={theme}
      onValueChange={(value) => {
        if (value === "light" || value === "dark" || value === "system") setTheme(value);
      }}
    >
      <SelectTrigger aria-label="Color theme" className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">System theme</SelectItem>
        <SelectItem value="light">Light theme</SelectItem>
        <SelectItem value="dark">Dark theme</SelectItem>
      </SelectContent>
    </Select>
  );
}
