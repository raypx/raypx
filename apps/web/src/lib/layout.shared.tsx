import type { TranslateFunction } from "@raypx/i18n/client";
import { ThemeSwitcherHorizontal } from "@raypx/ui/business/theme-switcher";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Logo } from "@/components/layout/logo";
import { docsI18nConfig } from "./docs/i18n";

export function baseOptions(t: TranslateFunction): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-xl font-semibold">{t("meta.title")}</span>
        </div>
      ),
    },
    themeSwitch: {
      component: <ThemeSwitcherHorizontal />,
    },
    githubUrl: "https://github.com/raypx/raypx",
    i18n: docsI18nConfig,
  } satisfies BaseLayoutProps;
}
