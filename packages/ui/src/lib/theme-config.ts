import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Laptop, Moon, Sun } from "@phosphor-icons/react";

export type ThemeKey = "light" | "dark" | "system";

export const themeIcons: Record<ThemeKey, PhosphorIcon> = {
  light: Sun,
  dark: Moon,
  system: Laptop,
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
