import { ThemeSwitcherHorizontal } from "@raypx/ui/business/theme-switcher";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { docsI18nConfig } from "./docs/i18n";

export function baseOptions(lang: string): BaseLayoutProps {
  console.log("baseOptions lang", lang);
  return {
    nav: {
      title: `Raypx ${lang}`,
    },
    themeSwitch: {
      component: <ThemeSwitcherHorizontal />,
    },
    githubUrl: "https://github.com/raypx/raypx",
    i18n: docsI18nConfig,
  } satisfies BaseLayoutProps;
}
