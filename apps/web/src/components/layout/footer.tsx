import { useLocale } from "@raypx/i18n/client";
import { ThemeSwitcher } from "@raypx/ui/business/theme-switcher";
import { Button } from "@raypx/ui/components/button";
import { Separator } from "@raypx/ui/components/separator";
import { Link } from "@tanstack/react-router";
import { Github, Twitter } from "lucide-react";
import Container from "./container";
import { Logo } from "./logo";

type FooterLink = {
  titleKey: string;
  links: {
    labelKey: string;
    href: string;
    external?: boolean;
  }[];
};

const footerLinks: FooterLink[] = [
  {
    titleKey: "footer.product.title",
    links: [
      { labelKey: "footer.product.features", href: "/#features" },
      { labelKey: "footer.product.techStack", href: "/#tech-stack" },
      {
        labelKey: "footer.product.roadmap",
        href: "https://github.com/raypx/raypx#-roadmap",
        external: true,
      },
    ],
  },
  {
    titleKey: "footer.resources.title",
    links: [
      { labelKey: "footer.resources.docs", href: "/$lang/docs" },
      {
        labelKey: "footer.resources.github",
        href: "https://github.com/raypx/raypx",
        external: true,
      },
      {
        labelKey: "footer.resources.changelog",
        href: "https://github.com/raypx/raypx/releases",
        external: true,
      },
    ],
  },
  {
    titleKey: "footer.community.title",
    links: [
      {
        labelKey: "footer.community.issues",
        href: "https://github.com/raypx/raypx/issues",
        external: true,
      },
      {
        labelKey: "footer.community.discussions",
        href: "https://github.com/raypx/raypx/discussions",
        external: true,
      },
      {
        labelKey: "footer.community.contributing",
        href: "https://github.com/raypx/raypx#-contributing",
        external: true,
      },
    ],
  },
];

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { t } = useLocale("layout");
  return (
    <footer className="border-t bg-background">
      <Container className="py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand section */}
          <div className="lg:col-span-2 space-y-4">
            <Link className="flex items-center space-x-2" to="/">
              <Logo />
              <span className="text-xl font-semibold">{t("nav.title")}</span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">{t("footer.tagline")}</p>
            <div className="flex items-center gap-2">
              <Button asChild size="icon" variant="ghost">
                <a
                  aria-label="GitHub"
                  href="https://github.com/raypx/raypx"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Github className="size-5" />
                </a>
              </Button>
              <Button asChild size="icon" variant="ghost">
                <a
                  aria-label="Twitter"
                  href="https://twitter.com/raypx"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Twitter className="size-5" />
                </a>
              </Button>
            </div>
          </div>

          {/* Links sections */}
          {footerLinks.map((section, index) => (
            <div className="space-y-4" key={index}>
              <h3 className="font-semibold">{t(section.titleKey)}</h3>
              <ul className="space-y-2">
                {section.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <Link
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      to={link.href}
                    >
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-8" />

        {/* Bottom section */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-muted-foreground">
            <p>{t("footer.copyright", { year: currentYear })}</p>
            <div className="flex items-center gap-4">
              <a
                className="hover:text-foreground transition-colors"
                href="https://opensource.org/licenses/Apache-2.0"
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("footer.license")}
              </a>
              <a className="hover:text-foreground transition-colors" href="/privacy">
                {t("footer.privacy")}
              </a>
              <a className="hover:text-foreground transition-colors" href="/terms">
                {t("footer.terms")}
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            {/* <LangSwitcher /> */}
          </div>
        </div>
      </Container>
    </footer>
  );
}
