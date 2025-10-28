import { useLocale } from "@raypx/i18n/client";
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
import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  const { t } = useLocale("layout");

  const menuLinks = [
    {
      title: "nav.home",
      href: "/",
      external: false,
    },
    {
      title: "nav.docs",
      href: "/docs",
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
            <Link className="flex items-center space-x-2" to="/">
              <Logo />
              <span className="text-xl font-semibold">{t("nav.title")}</span>
            </Link>
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
                      <Link to={item.href || "#"}>{t(item.title)}</Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* navbar right show sign in or user */}
          <div className="flex items-center gap-x-4 min-w-40">
            {!mounted ? (
              <Skeleton className="size-8 border rounded-full" />
            ) : (
              <div className="flex items-center gap-x-4">
                <Link to="/sign-in">
                  <Button className="cursor-pointer" size="sm" variant="outline">
                    {t("nav.login")}
                  </Button>
                </Link>
                <Link
                  className={cn(
                    buttonVariants({
                      variant: "default",
                      size: "sm",
                    }),
                  )}
                  to="/sign-up"
                >
                  {t("nav.signUp")}
                </Link>
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
