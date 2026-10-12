import { lazy } from "react";

let themeMenuItemsPromise: ReturnType<typeof importThemeMenuItems> | undefined;

function importThemeMenuItems() {
  return import("./theme-menu-items");
}

export function loadThemeMenuItems() {
  themeMenuItemsPromise ??= importThemeMenuItems();
  return themeMenuItemsPromise;
}

export const LazyThemeMenuItems = lazy(async () => {
  const module = await loadThemeMenuItems();
  return { default: module.ThemeMenuItems };
});
