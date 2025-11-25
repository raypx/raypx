import { ThemeSwitcher } from "@raypx/ui/business/theme-switcher";
import { Button } from "@raypx/ui/components/button";
import { Separator } from "@raypx/ui/components/separator";
import { Link } from "@tanstack/react-router";
import { Github, Twitter } from "lucide-react";
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand section */}
          <div className="lg:col-span-2 space-y-4">
            <Link className="flex items-center space-x-2" to="/">
              <Logo />
              <span className="text-xl font-semibold">{siteBrand.name}</span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">{siteBrand.tagline}</p>
            <div className="flex items-center gap-2">
              <Button asChild size="icon" variant="ghost">
                <a
                  aria-label="GitHub"
                  href={siteLinks.github}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Github className="size-5" />
                </a>
              </Button>
              <Button asChild size="icon" variant="ghost">
                <a
                  aria-label="Twitter"
                  href={siteLinks.twitter}
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
              <h3 className="font-semibold">{section.title}</h3>
              <ul className="space-y-2">
                {section.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    {link.external ? (
                      <a
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        href={link.href}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-muted-foreground">
            <p>© {currentYear} Raypx. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a
                className="hover:text-foreground transition-colors"
                href="https://opensource.org/licenses/Apache-2.0"
                rel="noopener noreferrer"
                target="_blank"
              >
                License
              </a>
              <a className="hover:text-foreground transition-colors" href="/privacy">
                Privacy
              </a>
              <a className="hover:text-foreground transition-colors" href="/terms">
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
