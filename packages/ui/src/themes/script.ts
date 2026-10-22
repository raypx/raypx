import { THEME_STORAGE_KEY, themeColors } from "./config";

export interface ThemeScriptOptions {
  /** Persistence key read before first paint; `false` skips stored preferences. */
  storageKey?: string | false;
  /**
   * Application-owned JavaScript expression evaluated first. A string result wins
   * over stored preferences; any other result falls through to storage.
   */
  initialThemeSource?: string;
}

/** Builds the inline script that applies the resolved theme before first paint. */
export function createThemeScript({
  storageKey = THEME_STORAGE_KEY,
  initialThemeSource,
}: ThemeScriptOptions = {}): string {
  const readInitial = initialThemeSource ? `theme = (${initialThemeSource});` : "";
  const readStored =
    storageKey === false
      ? ""
      : `var key = ${JSON.stringify(storageKey)};
    var cookie = document.cookie.split("; ").find(function(row){ return row.indexOf(key + "=") === 0; });
    var stored;
    try { stored = localStorage.getItem(key); } catch(e) {}
    theme = stored || (cookie ? decodeURIComponent(cookie.split("=")[1]) : null);`;
  return `(function(){
  var root = document.documentElement;
  var colors = ${JSON.stringify(themeColors)};
  function apply(resolved) {
    root.dataset.theme = resolved;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", colors[resolved]);
  }
  try {
    var theme;
    ${readInitial}
    if (typeof theme !== "string") {
    ${readStored}
    }
    if (theme !== "light" && theme !== "dark")
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    apply(theme);
  } catch(e) {
    apply("light");
  }
})();`;
}
