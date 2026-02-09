import type { BaseLayoutProps } from "@fumadocs/base-ui/layouts/shared";
import { ThemeSwitcher } from "@raypx/ui/business/theme-switcher";
import { Logo } from "~/components/layout/logo";
import { brand, links } from "~/config/site";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center gap-2">
          <Logo className="size-6" />
          <span className="font-semibold text-lg">{brand.name}</span>
        </div>
      ),
    },
    themeSwitch: {
      component: <ThemeSwitcher variant="horizontal" />,
    },
    githubUrl: links.github,
    links: [
      {
        url: links.docs,
        text: "Docs",
      },
      {
        url: links.github,
        text: "GitHub",
      },
    ],
  } satisfies BaseLayoutProps;
}
