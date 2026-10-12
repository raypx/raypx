export const THEME_STORAGE_KEY = "theme";
const validThemes = new Set(["light", "dark", "system"]);
export function parseTheme(raw, fallback) {
    return validThemes.has(raw) ? raw : fallback;
}
//# sourceMappingURL=config.js.map