import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import type { TablerIcon } from "@raypx/ui/components/icon";

export type ThemeKey = "light" | "dark" | "system";

export const themeIcons: Record<ThemeKey, TablerIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: DesktopIcon,
} as const;

export type ThemeConfig = {
  value: ThemeKey;
  label: string;
  icon: (typeof themeIcons)[keyof typeof themeIcons];
};

export const themeConfig: readonly ThemeConfig[] = [
  { value: "light", label: "Light", icon: themeIcons.light },
  { value: "dark", label: "Dark", icon: themeIcons.dark },
  { value: "system", label: "System", icon: themeIcons.system },
] as const;
