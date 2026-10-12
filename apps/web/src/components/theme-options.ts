import type { UserTheme } from "@voidmix/ui/theme";
import type { WebNamespaceKey } from "../i18n/client";

export const themeOptions: ReadonlyArray<{
  labelKey: Extract<WebNamespaceKey<"common">, "themeLight" | "themeDark" | "themeSystem">;
  value: UserTheme;
}> = [
  { labelKey: "themeLight", value: "light" },
  { labelKey: "themeDark", value: "dark" },
  { labelKey: "themeSystem", value: "system" },
];
