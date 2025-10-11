import { ThemeSwitcherHorizontal } from "@raypx/ui/components/theme-switcher";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Raypx",
    },
    themeSwitch: {
      component: <ThemeSwitcherHorizontal />,
    },
    githubUrl: "https://github.com/raypx/raypx",
  } satisfies BaseLayoutProps;
}
