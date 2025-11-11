import { ThemeSwitcherHorizontal } from "@raypx/ui/business/theme-switcher";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Logo } from "@/components/layout/logo";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-xl font-semibold">Raypx</span>
        </div>
      ),
    },
    themeSwitch: {
      component: <ThemeSwitcherHorizontal />,
    },
    githubUrl: "https://github.com/raypx/raypx",
  } satisfies BaseLayoutProps;
}
