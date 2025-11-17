import { ThemeSwitcher } from "@raypx/ui/business/theme-switcher";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Logo } from "@/components/layout/logo";
import { brand, links } from "@/config/site";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center gap-2">
          <Logo className="size-6" />
          <span className="text-lg font-semibold">{brand.name}</span>
        </div>
      ),
    },
    themeSwitch: {
      component: <ThemeSwitcher variant="horizontal" />,
    },
    githubUrl: links.github,
  } satisfies BaseLayoutProps;
}
