import { ThemeSwitcher } from "@raypx/ui/business/theme-switcher";
import { Button, buttonVariants } from "@raypx/ui/components/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@raypx/ui/components/navigation-menu";
import { Skeleton } from "@raypx/ui/components/skeleton";
import { cn } from "@raypx/ui/lib/utils";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as LocaleLink } from "@/components/link";
import { useScroll } from "@/hooks/use-scroll";
import Container from "./container";
import { LangSwitcher } from "./lang-switcher";
import { Logo } from "./logo";

type NavBarProps = {
  scroll?: boolean;
};

const customNavigationMenuTriggerStyle = cn(
  navigationMenuTriggerStyle(),
  "relative bg-transparent text-muted-foreground cursor-pointer",
  "hover:bg-accent hover:text-accent-foreground",
  "focus:bg-accent focus:text-accent-foreground",
  "data-active:font-semibold data-active:bg-transparent data-active:text-foreground",
  "data-[state=open]:bg-transparent data-[state=open]:text-foreground",
);

export function Navbar({ scroll }: NavBarProps) {
  const scrolled = useScroll(50);
  const [mounted, setMounted] = useState(false);
  const location = useLocation();
  const { t } = useTranslation("layout");

  const menuLinks = [
    {
      title: "nav.home",
      href: "/",
      external: false,
    },
    {
      title: "nav.docs",
      href: "/$lang/docs",
      external: false,
    },
  ];

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section
      className={cn(
        "sticky inset-x-0 top-0 z-40 py-4 transition-all duration-300",
        scroll
          ? scrolled
            ? "bg-background/80 backdrop-blur-md border-b supports-backdrop-filter:bg-background/60"
            : "bg-transparent"
          : "border-b bg-background",
      )}
    >
      <Container className="px-4">
        {/* desktop navbar */}
        <nav className="hidden lg:flex">
          {/* logo and name */}
          <div className="flex items-center">
            <LocaleLink className="flex items-center space-x-2" href="/">
              <Logo />
              <span className="text-xl font-semibold">{t("nav.title")}</span>
            </LocaleLink>
          </div>

          {/* menu links */}
          <div className="flex-1 flex items-center justify-center space-x-2">
            <NavigationMenu className="relative">
              <NavigationMenuList className="flex items-center">
                {menuLinks?.map((item, index) => (
                  <NavigationMenuItem key={index}>
                    <NavigationMenuLink
                      active={
                        item.href === "/"
                          ? location.pathname === "/"
                          : location.pathname.startsWith(item.href)
                      }
                      asChild
                      className={customNavigationMenuTriggerStyle}
                    >
                      <LocaleLink
                        href={item.href || "#"}
                        rel={item.external ? "noopener noreferrer" : undefined}
                        target={item.external ? "_blank" : undefined}
                      >
                        {t(item.title)}
                      </LocaleLink>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* navbar right show sign in or user */}
          <div className="flex items-center gap-x-4">
            {!mounted ? (
              <Skeleton className="size-8 border rounded-full" />
            ) : (
              <div className="flex items-center gap-x-4">
                <LocaleLink href="/sign-in">
                  <Button className="cursor-pointer" size="sm" variant="outline">
                    {t("nav.login")}
                  </Button>
                </LocaleLink>
                <LocaleLink
                  className={cn(
                    buttonVariants({
                      variant: "default",
                      size: "sm",
                    }),
                  )}
                  href="/sign-up"
                >
                  {t("nav.signUp")}
                </LocaleLink>
              </div>
            )}
            <ThemeSwitcher />
            <LangSwitcher />
          </div>
        </nav>

        {/* mobile navbar */}
        <div className="lg:hidden" />
      </Container>
    </section>
  );
}
