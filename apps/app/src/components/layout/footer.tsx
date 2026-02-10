import { ThemeSwitcher } from "@raypx/ui/business/theme-switcher";
import { Button } from "@raypx/ui/components/button";
import { Separator } from "@raypx/ui/components/separator";
import { IconBrandGithub, IconBrandX } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { brand as siteBrand, footer as siteFooter, links as siteLinks } from "~/config/site";
import Container from "./container";
import { Logo } from "./logo";

type FooterLink = {
  title: string;
  links: {
    label: string;
    href: string;
    external?: boolean;
  }[];
};

const footerLinks: FooterLink[] = siteFooter.sections;

export function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="border-t bg-background">
      <Container className="py-12 md:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-2 lg:grid-cols-5 lg:gap-12">
          {/* Brand section */}
          <div className="col-span-2 space-y-4 lg:col-span-2">
            <Link className="flex items-center space-x-2" to="/">
              <Logo />
              <span className="font-semibold text-xl">{siteBrand.name}</span>
            </Link>
            <p className="max-w-xs text-muted-foreground text-sm">{siteBrand.tagline}</p>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost">
                <a
                  aria-label="GitHub"
                  href={siteLinks.github}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <IconBrandGithub className="size-5" />
                </a>
              </Button>
              <Button size="icon" variant="ghost">
                <a
                  aria-label="Twitter"
                  href={siteLinks.twitter}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <IconBrandX className="size-5" />
                </a>
              </Button>
            </div>
          </div>

          {/* Links sections */}
          {footerLinks.map((section, index) => (
            <div className="space-y-4" key={index}>
              <h3 className="font-semibold">{section.title}</h3>
              <ul className="space-y-2">
                {section.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    {link.external ? (
                      <a
                        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                        href={link.href}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                        to={link.href}
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-8" />

        {/* Bottom section */}
        <div className="flex flex-col-reverse items-center justify-between gap-4 text-sm md:flex-row">
          <div className="flex flex-col items-center gap-4 text-center text-muted-foreground sm:flex-row sm:text-left">
            <p>© {currentYear} Raypx. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a
                className="transition-colors hover:text-foreground"
                href="https://opensource.org/licenses/Apache-2.0"
                rel="noopener noreferrer"
                target="_blank"
              >
                License
              </a>
              <a className="transition-colors hover:text-foreground" href="/privacy">
                Privacy
              </a>
              <a className="transition-colors hover:text-foreground" href="/terms">
                Terms
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
          </div>
        </div>
      </Container>
    </footer>
  );
}
